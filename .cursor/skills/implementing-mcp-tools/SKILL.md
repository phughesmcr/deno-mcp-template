---
name: implementing-mcp-tools
description: Implement new MCP tools in the deno-mcp-template project. Provides the exact file structure, type signatures, registration steps, and patterns for standard tools, sampling tools, form and URL elicitation, resource-backed tools, and notification tools. Use when adding a new tool, creating MCP tools, or asking how tools work in this project.
---

# Implementing MCP Tools

## Workflow

```
Task Progress:
- [ ] Step 1: Create tool file in src/mcp/tools/
- [ ] Step 2: Define Zod schema, name, config, and callback
- [ ] Step 3: Export as default ToolModule
- [ ] Step 4: Register in src/mcp/tools/mod.ts
- [ ] Step 5: Run `deno task ci` to verify
```

## Tool File Template

Every tool follows this structure. Create a new file in `src/mcp/tools/`.

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import {
  createCallToolErrorResponse,
  createCallToolTextResponse,
} from "$/shared/utils.ts";

// 1. Input schema
const schema = z.object({
  myField: z.string().min(1, "Required").describe("What this field does"),
});

// 2. Tool name (kebab-case)
const name = "my-tool-name";

// 3. Config
// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Human-readable title",
  description: "What this tool does — shown to the LLM",
  inputSchema: schema.shape,
};

// 4. Callback factory: receives McpServer, returns the handler
// deno-lint-ignore no-explicit-any
const callback = (_mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return createCallToolErrorResponse({
      error: "Invalid arguments",
      details: parsed.error.flatten(),
      received: args,
    });
  }

  const { myField } = parsed.data;

  // ... tool logic ...

  return createCallToolTextResponse({ result: myField });
};

// 5. Export as ToolModule tuple
// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [name, config, callback];

export default module;
```

## Registration

In `src/mcp/tools/mod.ts`:

1. Import the tool: `import myTool from "./myTool.ts";`
2. Add it to the `tools` array:

```typescript
export const tools: ToolModule<any>[] = [
  // ... existing tools
  myTool,
];
```

The `ToolManager` in the same file handles binding and registration automatically.

## Key Types

From `src/shared/types.ts`:

- **`ToolModule<InputArgs, OutputArgs>`** — Export format: `[name, config, callbackFactory]`
- **`ToolConfig<InputArgs, OutputArgs>`** — `{ title, description, inputSchema, outputSchema?, annotations? }`
- **`ToolPlugin`** — Bound format: `[name, config, callback]` (created by `ToolManager`)

## Response Helpers

From `src/shared/utils.ts`:

- **`createCallToolTextResponse(obj, structuredContent?)`** — Wraps `obj` as JSON text content
- **`createCallToolErrorResponse(obj, structuredContent?)`** — Same but sets `isError: true`

## Validation Pattern

Always validate with Zod `safeParse`. For optional args, use `args ?? {}`:

```typescript
const parsed = schema.safeParse(args ?? {});
if (!parsed.success) {
  return createCallToolErrorResponse({
    error: "Invalid arguments",
    details: parsed.error.flatten(),
    received: args,
  });
}
```

## Error Handling Pattern

Wrap operational logic in try/catch:

```typescript
try {
  const result = await doSomething(parsed.data);
  return createCallToolTextResponse({ result });
} catch (error) {
  return createCallToolErrorResponse({
    error: error instanceof Error ? error.message : "Unknown error",
    operation: "my-operation",
  });
}
```

## Tool Categories

### Standard Tool (no MCP server interaction)

Use `_mcp` (unused) in the callback factory. See the template above.

### Sampling Tool (LLM-powered)

Use `mcp.server.createMessage()` to request LLM completions:

```typescript
const callback = (mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  // ... validate args ...

  const response = await mcp.server.createMessage(
    {
      messages: [{ role: "user", content: { type: "text", text: prompt } }],
      maxTokens: 1024,
      temperature: 0.7,
    },
    { timeout: 30000 },
  );

  const content = Array.isArray(response.content)
    ? response.content[0]
    : response.content;

  if (!content || content.type !== "text") {
    return createCallToolErrorResponse({ error: "No text response from sampling" });
  }

  return createCallToolTextResponse({ result: content.text });
};
```

### Elicitation Tool (user input)

Experimental elicitation is enabled in `src/mcp/serverDefinition.ts` (`experimentalElicitation: true`). Two modes matter in practice:

| Mode | Use case | Mechanism |
|------|----------|-----------|
| **`form`** | Structured, non-sensitive fields; validated in the MCP client UI | `await mcp.server.elicitInput({ mode: "form", message, requestedSchema })` |
| **`url`** | Sensitive or browser-only flows (confirmations, OAuth, secrets typed in your page) | Throw `UrlElicitationRequiredError` with a URL; complete out-of-band, then `createElicitationCompletionNotifier` fires `notifications/elicitation/complete` |

#### Form mode

Use `mcp.server.elicitInput()` with a JSON Schema (`requestedSchema`):

```typescript
const callback = (mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  // ... validate args ...

  const result = await mcp.server.elicitInput({
    mode: "form",
    message: "Please provide details",
    requestedSchema: {
      type: "object",
      properties: {
        name: { type: "string", title: "Name", description: "Your name" },
      },
      required: ["name"],
    },
  });

  return createCallToolTextResponse({ elicitationResult: result });
};
```

Branch on `result.action` (`accept` with `content`, `decline`, or cancelled) before assuming data exists. For multiple steps, call `elicitInput` more than once in one tool (see `src/mcp/tools/elicitFormWizard.ts`).

#### URL mode

The client opens a **browser URL** you control. The tool does **not** return a normal success result; it throws `UrlElicitationRequiredError` from `@modelcontextprotocol/sdk/types.js` with an array of `{ mode: "url", message, url, elicitationId }`.

In this template:

1. **`McpServerFactoryContext`** includes `urlElicitation: { baseUrl, registry }` (`src/mcp/context.ts`). Resolve `baseUrl` with `MCP_PUBLIC_BASE_URL` or the derived bind URL (`src/shared/publicBaseUrl.ts`).
2. Register pending state and the SDK notifier: `mcp.server.createElicitationCompletionNotifier(elicitationId)`, then `ctx.urlElicitation.registry.registerPending({ elicitationId, sessionId, label, completionNotifier })`.
3. Require **`extra.sessionId`** on the tool handler (streamable HTTP). STDIO has no session; return `createCallToolErrorResponse` instead of throwing.
4. Browser routes live in `src/app/http/urlElicitationRoutes.ts` (`GET`/`POST` `/mcp-elicitation/confirm`). They validate session + elicitation id against the registry and active transport, then call `registry.complete(elicitationId)`. Bearer auth is skipped for `/mcp-elicitation` so users are not prompted for the MCP token in a normal browser tab (`src/app/http/httpBearerAuthMiddleware.ts`).
5. Reference implementation: `registerUrlElicitationDemoTool` in `src/mcp/tools/urlElicitationDemo.ts`, wired from `src/mcp/mod.ts` when `mcpServerDefinition.urlElicitationDemo` is true.

Do not log secrets submitted on elicitation HTML forms.

### Resource-Backed Tool

Import resource helpers and mutate state. Resource subscriptions handle notifications automatically via KV watchers:

```typescript
import { COUNTER_URI, incrementCounterValue } from "../resources/counter.ts";

// In callback:
const value = await incrementCounterValue(delta);
return createCallToolTextResponse({ value, uri: COUNTER_URI });
```

### Notification Tool (logging)

Use `mcp.server.sendLoggingMessage()`:

```typescript
await mcp.server.sendLoggingMessage({
  level: "info",    // debug | info | notice | warning | error | critical | alert | emergency
  logger: "my-logger",
  data: { message: "Something happened" },
});
```

### Notification Tool (list changed)

Use `mcp.sendToolListChanged()`, `mcp.sendPromptListChanged()`, or `mcp.sendResourceListChanged()` to notify clients that available items have changed.

## Annotations

Add `annotations` to config for client hints:

```typescript
const config: ToolConfig<typeof schema.shape, any> = {
  title: "My Tool",
  description: "...",
  inputSchema: schema.shape,
  annotations: {
    title: "My Tool",
    readOnlyHint: true,
    openWorldHint: false,
  },
};
```

## Additional Resources

- For complete tool examples by category, see [examples.md](examples.md)
- MCP Tool spec: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP Sampling: https://modelcontextprotocol.io/docs/concepts/sampling
- MCP Elicitation: https://modelcontextprotocol.io/docs/concepts/elicitation
