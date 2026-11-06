# MCP Tool Examples

Complete, working examples from the codebase for each tool category.

## Standard Tool - HTTP Request

`src/mcp/tools/fetchWebsiteInfoShared.ts` implements the `fetch-website-info` tool logic (HEAD request); the tool and `ui://` resource are registered in `src/mcp/apps/fetchWebsiteInfoApp.ts` via `@modelcontextprotocol/ext-apps/server`. The snippet below is a simplified sketch of the `defineTool` shape, not the real code: the real tool sends the request through `headUrlWithSafeRedirects` (`src/shared/validation/safeToolFetchUrl.ts`), which enforces the SSRF policy (see `MCP_DOMAIN_TOOL_ALLOW_HTTP`) and re-checks each redirect, whereas the plain `fetch(..., { redirect: "follow" })` below does neither. Do not copy it for untrusted URLs.

```typescript
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

export default defineTool({
  name: "fetch-website-info",
  title: "Website Info Fetcher",
  description: "Fetch basic information about a website (status, headers, server, content type)",
  inputSchema: z.object({
    url: z.string()
      .url("Must be a valid URL")
      .max(2000, "URL too long")
      .describe("The URL to fetch information for"),
  }),
  runtime: { requiresNet: true },
  handler: async ({ url }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
      });

      const headers: Record<string, string> = {};
      for (const key of ["content-type", "server", "x-powered-by", "cache-control", "etag"]) {
        const value = response.headers.get(key);
        if (value) headers[key] = value;
      }

      return createCallToolTextResponse({
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        redirected: response.redirected,
        headers,
        timestamp: new Date().toISOString(),
      });
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return createCallToolErrorResponse({ error: "Request timed out after 10 seconds", url });
      }
      return createCallToolErrorResponse({
        error: fetchError instanceof Error
          ? `Network error: ${fetchError.message}`
          : "Unknown network error",
        url,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  },
});
```

Key patterns:
- Arguments arrive validated; no `safeParse` in the handler
- `runtime: { requiresNet: true }` feeds the permission preflight
- Timeout with `AbortController`, cleared in `finally`
- Specific error messages per failure mode

---

## Resource-Backed Tool - Counter

`src/mcp/tools/incrementCounter.ts` updates a KV-backed counter:

```typescript
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";
import { COUNTER_URI } from "../resources/counter.ts";
import { incrementPersistedCounterValue } from "../resources/counterStore.ts";

export default defineTool({
  name: "increment-counter",
  title: "Increment counter",
  description: "Increment a resource-backed counter and notify subscribers",
  inputSchema: z.object({
    delta: z.number().int().min(1, "Delta must be at least 1").max(1000, "Delta too large")
      .default(1),
  }),
  handler: async ({ delta }, _ctx, { kv }) => {
    const value = await incrementPersistedCounterValue(delta, kv);
    return createCallToolTextResponse({ value, delta, uri: COUNTER_URI });
  },
});
```

Key patterns:
- `.default(...)` instead of `args ?? {}` for optional fields
- Third handler argument is the shared `McpServerFactoryContext`; `kv` is the process-wide Deno KV runtime
- Subscribers are notified by the KV watcher through the `ServerEventBus`; the tool just mutates state

---

## Sampling Tool - Poem Generator

`src/mcp/tools/poem.ts` asks the client's LLM via an `input_required` round:

```typescript
import { inputRequired, inputResponse } from "@modelcontextprotocol/server";
import { z } from "zod";

import { samplingText } from "$/mcp/inputResponses.ts";
import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const INPUT_KEY = "poem";

export default defineTool({
  name: "poem",
  title: "Generate a poem",
  description: "Generate a poem for the given prompt",
  inputSchema: z.object({
    prompt: z.string()
      .min(1, "Prompt is required")
      .max(5000, "Prompt too long (max 5000 characters)")
      .describe("The prompt to generate a poem for"),
  }),
  handler: ({ prompt }, ctx) => {
    const view = inputResponse(ctx.mcpReq.inputResponses, INPUT_KEY);
    if (view.kind === "missing") {
      return inputRequired({
        inputRequests: {
          [INPUT_KEY]: inputRequired.createMessage({
            messages: [{
              role: "user",
              content: {
                type: "text",
                text: `Generate a poem for the following prompt:\n\n${prompt}`,
              },
            }],
            maxTokens: 1024,
            temperature: 0.7,
          }),
        },
      });
    }

    const poem = samplingText(ctx, INPUT_KEY);
    if (poem === undefined) {
      return createCallToolErrorResponse({
        error: "No text response from sampling",
        prompt,
        operation: "poem-generation",
      });
    }

    return createCallToolTextResponse({ poem, prompt, timestamp: new Date().toISOString() });
  },
});
```

Key patterns:
- The first call returns `inputRequired(...)`; the client runs the sampling request and retries the call with `ctx.mcpReq.inputResponses[INPUT_KEY]` set
- `inputResponse(...).kind === "missing"` means this is the first round
- `samplingText` (from `src/mcp/inputResponses.ts`) handles array or single content and checks for `type: "text"`

---

## Elicitation Tool - User Form Input

`src/mcp/tools/elicitInput.ts` collects structured input from the user:

```typescript
import { acceptedContent, inputRequired } from "@modelcontextprotocol/server";
import { z } from "zod";

import { wasDeclined } from "$/mcp/inputResponses.ts";
import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const INPUT_KEY = "details";

const details = z.object({
  name: z.string().meta({ title: "Name", description: "What should we call you?" }),
  favoriteColor: z.string().optional().meta({
    title: "Favorite color",
    description: "Just for fun",
  }),
});

export default defineTool({
  name: "elicit-input",
  title: "Elicit input",
  description: "Demonstrate form-based elicitation",
  inputSchema: z.object({
    purpose: z.string().min(1, "Purpose is required").max(200, "Purpose too long"),
  }),
  handler: ({ purpose }, ctx) => {
    if (wasDeclined(ctx, INPUT_KEY)) return createCallToolTextResponse({ cancelled: true });

    const answer = acceptedContent(ctx.mcpReq.inputResponses, INPUT_KEY, details);
    if (answer) return createCallToolTextResponse({ purpose, ...answer });

    return inputRequired({
      inputRequests: {
        [INPUT_KEY]: inputRequired.elicit({
          message: `Please provide a couple details for: ${purpose}`,
          requestedSchema: details,
        }),
      },
    });
  },
});
```

Key patterns:
- `requestedSchema` is a Zod schema (the SDK converts it to JSON Schema); use `.meta({ title, description })` for field labels
- Check `wasDeclined` first, then `acceptedContent`, then ask
- Multi-step flows mint signed `requestState` between rounds: see `src/mcp/tools/elicitFormWizard.ts`

---

## Notification Tool - Logging

`src/mcp/tools/logMessage.ts` sends structured log messages:

```typescript
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

export default defineTool({
  name: "log-message",
  title: "Log a message",
  description: "Send a structured log message to the client",
  inputSchema: z.object({
    message: z.string().min(1, "Message is required").max(1000, "Message too long"),
    level: z.enum([
      "debug",
      "info",
      "notice",
      "warning",
      "error",
      "critical",
      "alert",
      "emergency",
    ]).default("info"),
    logger: z.string().max(100, "Logger name too long").optional(),
  }),
  handler: async ({ message, level, logger }, ctx) => {
    await ctx.mcpReq.log(level, { message }, logger);
    return createCallToolTextResponse({ logged: true, level, logger: logger ?? null, message });
  },
});
```

Log levels: `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`

---

## Notification Tool - List Changed

`src/mcp/tools/notifyListChanged.ts` publishes on the shared `ServerEventBus`:

```typescript
handler: ({ target }, _ctx, { events }) => {
  events.publish({ kind: EVENT_KINDS[target] }); // "tools_list_changed" | "prompts_list_changed" | "resources_list_changed"
  return createCallToolTextResponse({ notified: true, target });
},
```

---

## Minimal Starter

Copy-paste starting point for a new tool:

```typescript
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

export default defineTool({
  name: "TODO-tool-name",
  title: "TODO title",
  description: "TODO description",
  inputSchema: z.object({
    // TODO: define your input fields
  }),
  handler: (_args, _ctx, _deps) => {
    // TODO: implement tool logic
    return createCallToolTextResponse({ /* TODO: result */ });
  },
});
```

Then register in `src/mcp/tools/mod.ts`:

```typescript
import myTool from "./myTool.ts";

export const tools: readonly ToolPlugin[] = [
  // ... existing tools
  myTool,
];
```
