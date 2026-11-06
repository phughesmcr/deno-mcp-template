# MCP Tool Examples

Complete, working examples from the codebase for each tool category.

## Standard Tool - HTTP Request

`src/mcp/tools/fetchWebsiteInfoShared.ts` implements the `fetch-website-info` tool logic (HEAD request); the tool and `ui://` resource are registered in `src/mcp/apps/fetchWebsiteInfoApp.ts` via `@modelcontextprotocol/ext-apps/server`. The snippet below is a simplified sketch of the `defineTool` shape, not the real code: the real tool sends the request through `headUrlWithSafeRedirects` (`src/shared/validation/safeToolFetchUrl.ts`), which enforces the SSRF policy (see `MCP_DOMAIN_TOOL_ALLOW_HTTP`) and re-checks each redirect, whereas the plain `fetch(..., { redirect: "follow" })` below does neither. Do not copy it for untrusted URLs.

```typescript
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";
import {
  DisallowedFetchUrlError,
  headUrlWithSafeRedirects,
} from "$/shared/validation/safeToolFetchUrl.ts";

const outputSchema = z.object({
  url: z.string().describe("The URL that answered, after any redirects"),
  status: z.number().int().describe("HTTP status code"),
  statusText: z.string().describe("HTTP status text"),
  redirected: z.boolean().describe("Whether at least one redirect was followed"),
  headers: z.record(z.string(), z.string()).describe("A selection of the response headers"),
  timestamp: z.iso.datetime().describe("When the response was received"),
});

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
  outputSchema,
  annotations: { readOnlyHint: true, openWorldHint: true },
  runtime: { requiresNet: true },
  handler: async ({ url }, ctx) => {
    const signal = AbortSignal.any([ctx.mcpReq.signal, AbortSignal.timeout(10_000)]);

    try {
      const { response, redirected } = await headUrlWithSafeRedirects(url, signal);

      const headers: Record<string, string> = {};
      for (const key of ["content-type", "server", "x-powered-by", "cache-control", "etag"]) {
        const value = response.headers.get(key);
        if (value) headers[key] = value;
      }

      const result: z.infer<typeof outputSchema> = {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        redirected,
        headers,
        timestamp: new Date().toISOString(),
      };
      return createCallToolTextResponse(result, result);
    } catch (error) {
      if (error instanceof DisallowedFetchUrlError) {
        return createCallToolErrorResponse({ error: "URL not allowed" });
      }
      if (error instanceof Error && error.name === "TimeoutError") {
        return createCallToolErrorResponse({ error: "Request timed out after 10 seconds", url });
      }
      return createCallToolErrorResponse({
        error: error instanceof Error ? `Network error: ${error.message}` : "Unknown network error",
        url,
      });
    }
  },
});
```

Key patterns:
- Arguments arrive validated; no `safeParse` in the handler
- `outputSchema` plus matching `structuredContent`: pass the same object as both arguments of `createCallToolTextResponse`. Error results skip the schema
- `annotations` say this tool only reads, but reaches the open web
- `runtime: { requiresNet: true }` feeds the permission preflight
- `AbortSignal.any` stops on client cancellation or the timeout; `AbortSignal.timeout` rejects with a `TimeoutError`, not an `AbortError`
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

const outputSchema = z.object({
  value: z.number().int().describe("The counter after this increment"),
  delta: z.number().int().describe("The amount added"),
  uri: z.string().describe("The resource holding the counter"),
});

export default defineTool({
  name: "increment-counter",
  title: "Increment counter",
  description: "Increment a resource-backed counter and notify subscribers",
  inputSchema: z.object({
    delta: z.number().int().min(1, "Delta must be at least 1").max(1000, "Delta too large")
      .default(1),
  }),
  outputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ delta }, _ctx, { kv }) => {
    const value = await incrementPersistedCounterValue(delta, kv);
    const result: z.infer<typeof outputSchema> = { value, delta, uri: COUNTER_URI };
    return createCallToolTextResponse(result, result);
  },
});
```

Key patterns:
- `.default(...)` instead of `args ?? {}` for optional fields
- `idempotentHint: false` because a repeated call adds to the counter again
- Third handler argument is the shared `McpServerFactoryContext`; `kv` is the process-wide Deno KV runtime
- Subscribers are notified by the KV watcher through the `ServerEventBus`; the tool just mutates state

---

## Sampling Tool - Poem Generator

`src/mcp/tools/poem.ts` asks the client's LLM via an `input_required` round. Sampling is deprecated by SEP-2577, still in the spec for at least twelve months:

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
  annotations: { readOnlyHint: true, openWorldHint: false },
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
  annotations: { readOnlyHint: true, openWorldHint: false },
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

`src/mcp/tools/logMessage.ts` sends structured log messages. Logging is deprecated by SEP-2577, still in the spec for at least twelve months:

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
  annotations: { readOnlyHint: true, openWorldHint: false },
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
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
},
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

const outputSchema = z.object({
  // TODO: define your result fields
});

export default defineTool({
  name: "TODO-tool-name",
  title: "TODO title",
  description: "TODO description",
  inputSchema: z.object({
    // TODO: define your input fields
  }),
  outputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false }, // TODO: say what is true of this tool
  handler: (_args, _ctx, _deps) => {
    // TODO: implement tool logic
    const result: z.infer<typeof outputSchema> = { /* TODO: result */ };
    return createCallToolTextResponse(result, result);
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
