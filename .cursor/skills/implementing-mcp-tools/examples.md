# MCP Tool Examples

Complete, working examples from the codebase for each tool category.

## Standard Tool — HTTP Request

`src/mcp/tools/domain.ts` fetches website info via HEAD request:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({
  url: z.string()
    .url("Must be a valid URL")
    .max(2000, "URL too long")
    .describe("The URL to fetch information for"),
});

const name = "fetch-website-info";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Website Info Fetcher",
  description: "Fetch basic information about a website (status, headers, server, content type)",
  inputSchema: schema.shape,
};

// deno-lint-ignore no-explicit-any
const callback = (_mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  try {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return createCallToolErrorResponse({
        error: "Invalid arguments",
        details: parsed.error.flatten(),
        received: args,
      });
    }

    const { url } = parsed.data;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeoutId);

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
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return createCallToolErrorResponse({ error: "Request timed out after 10 seconds", url });
      }

      return createCallToolErrorResponse({
        error: fetchError instanceof Error
          ? `Network error: ${fetchError.message}`
          : "Unknown network error",
        url,
      });
    }
  } catch (error) {
    return createCallToolErrorResponse({
      error: error instanceof Error ? error.message : "Unknown error occurred",
      args,
    });
  }
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [name, config, callback];

export default module;
```

Key patterns:
- Timeout with `AbortController`
- Nested try/catch: outer for validation, inner for network errors
- Specific error messages per failure mode

---

## Resource-Backed Tool — Counter

`src/mcp/tools/incrementCounter.ts` updates a KV-backed counter:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";
import { COUNTER_URI, incrementCounterValue } from "../resources/counter.ts";

const schema = z.object({
  delta: z.number().int().min(1, "Delta must be at least 1").max(1000, "Delta too large")
    .optional(),
});

const name = "increment-counter";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Increment counter",
  description: "Increment a resource-backed counter and notify subscribers",
  inputSchema: schema.shape,
};

// deno-lint-ignore no-explicit-any
const callback = (_mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    return createCallToolErrorResponse({
      error: "Invalid arguments",
      details: parsed.error.flatten(),
      received: args,
    });
  }

  const delta = parsed.data.delta ?? 1;
  const value = await incrementCounterValue(delta);

  return createCallToolTextResponse({ value, delta, uri: COUNTER_URI });
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [name, config, callback];

export default module;
```

Key patterns:
- `args ?? {}` for schemas with all-optional fields
- Resource mutation function imported from the resource module
- Subscription notifications are automatic via KV watchers — the tool just mutates state

---

## Sampling Tool — Poem Generator

`src/mcp/tools/poem.ts` uses LLM sampling:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({
  prompt: z.string()
    .min(1, "Prompt is required")
    .max(5000, "Prompt too long (max 5000 characters)")
    .describe("The prompt to generate a poem for"),
});

const name = "poem";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Generate a poem",
  description: "Generate a poem for the given prompt",
  inputSchema: schema.shape,
};

// deno-lint-ignore no-explicit-any
const callback = (mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return createCallToolErrorResponse({
      error: "Invalid arguments",
      details: parsed.error.flatten(),
      received: args,
    });
  }

  const { prompt } = parsed.data;

  try {
    const response = await mcp.server.createMessage(
      {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Generate a poem for the following prompt:\n\n${prompt}`,
            },
          },
        ],
        maxTokens: 1024,
        temperature: 0.7,
      },
      { timeout: 30000 },
    );

    const content = Array.isArray(response.content) ? response.content[0] : response.content;

    if (!content || content.type !== "text") {
      return createCallToolErrorResponse({
        error: "No text response from sampling",
        prompt,
        responseType: content?.type ?? "unknown",
        operation: "poem-generation",
      });
    }

    return createCallToolTextResponse({
      poem: content.text,
      prompt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createCallToolErrorResponse({
      error: error instanceof Error ? error.message : "Unknown error during poem generation",
      prompt,
      operation: "poem-generation",
    });
  }
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [name, config, callback];

export default module;
```

Key patterns:
- `mcp` (not `_mcp`) — sampling tools need the server reference
- `mcp.server.createMessage()` with messages array and maxTokens
- Handle both array and single content in response
- Check for `type: "text"` before accessing `.text`

---

## Elicitation Tool — User Form Input

`src/mcp/tools/elicitInput.ts` collects structured input from the user:

```typescript
const callback = (mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  // ... validate args ...

  const result = await mcp.server.elicitInput({
    mode: "form",
    message: `Please provide details for: ${purpose}`,
    requestedSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          title: "Name",
          description: "What should we call you?",
        },
        favoriteColor: {
          type: "string",
          title: "Favorite color",
          description: "Just for fun",
        },
      },
      required: ["name"],
    },
  });

  return createCallToolTextResponse({ elicitationResult: result });
};
```

Key patterns:
- `requestedSchema` uses JSON Schema (not Zod) — `type`, `properties`, `required`
- `mode: "form"` for structured form input

---

## Notification Tool — Logging

`src/mcp/tools/logMessage.ts` sends structured log messages:

```typescript
const callback = (mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  // ... validate args ...

  await mcp.server.sendLoggingMessage({
    level: level ?? "info",
    logger,
    data: { message },
  });

  return createCallToolTextResponse({
    logged: true,
    level: level ?? "info",
    logger: logger ?? null,
    message,
  });
};
```

Log levels: `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`

---

## Minimal Starter

Copy-paste starting point for a new tool:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import {
  createCallToolErrorResponse,
  createCallToolTextResponse,
} from "$/shared/utils.ts";

const schema = z.object({
  // TODO: define your input fields
});

const name = "TODO-tool-name";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "TODO title",
  description: "TODO description",
  inputSchema: schema.shape,
};

// deno-lint-ignore no-explicit-any
const callback = (_mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    return createCallToolErrorResponse({
      error: "Invalid arguments",
      details: parsed.error.flatten(),
      received: args,
    });
  }

  // TODO: implement tool logic

  return createCallToolTextResponse({ /* TODO: result */ });
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [name, config, callback];

export default module;
```

Then register in `src/mcp/tools/mod.ts`:

```typescript
import myTool from "./myTool.ts";

export const tools: ToolModule<any>[] = [
  // ... existing tools
  myTool,
];
```
