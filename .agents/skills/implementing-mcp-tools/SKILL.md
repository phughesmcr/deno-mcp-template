---
name: implementing-mcp-tools
description: Implement new MCP tools in the deno-mcp-template project. Provides the exact file structure, type signatures, registration steps, and patterns for standard tools, sampling tools, multi-round form and URL elicitation (input_required), resource-backed tools, and notification tools. Use when adding a new tool, creating MCP tools, or asking how tools work in this project.
---

# Implementing MCP Tools

The server is stateless and speaks protocol revision 2026-07-28 (`@modelcontextprotocol/server` 2.x). With `--legacy-stdio` it also serves 2025-era STDIO clients, and the SDK fulfils `inputRequired` for them, so a tool needs no era checks. There are no sessions, no `initialize`, and no server-to-client requests mid-call: a tool that needs user input or an LLM completion **returns `inputRequired(...)`** and is called again with the answers.

## Workflow

```
Task Progress:
- [ ] Step 1: Create tool file in src/mcp/tools/
- [ ] Step 2: Define Zod schemas and call defineTool({ name, inputSchema, outputSchema, annotations, handler })
- [ ] Step 3: Export the result as the default export
- [ ] Step 4: Register in src/mcp/tools/mod.ts
- [ ] Step 5: Run `deno fmt`, then `deno task ci` to verify
```

## Tool File Template

Every tool follows this structure. Create a new file in `src/mcp/tools/`.

```typescript
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const outputSchema = z.object({
  result: z.string().describe("What the tool produced"),
});

export default defineTool({
  name: "my-tool-name", // kebab-case
  title: "Human-readable title",
  description: "What this tool does - shown to the LLM",
  inputSchema: z.object({
    myField: z.string().min(1, "Required").describe("What this field does"),
  }),
  outputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false },
  // Optional: runtime: { requiresNet: true } when the tool does outbound I/O
  handler: async ({ myField }, _ctx, _deps) => {
    // `myField` is already validated and typed; no safeParse needed.
    // ... tool logic ...
    const result: z.infer<typeof outputSchema> = { result: myField };
    return createCallToolTextResponse(result, result);
  },
});
```

## Registration

In `src/mcp/tools/mod.ts`:

1. Import the tool: `import myTool from "./myTool.ts";`
2. Add it to the `tools` array:

```typescript
export const tools: readonly ToolPlugin[] = [
  // ... existing tools
  myTool,
];
```

`createMcpServer` (`src/mcp/mod.ts`) calls `tool.register(server, deps)` for each entry. A fresh `McpServer` is built per HTTP request, so keep state in `deps.kv`, never in module scope or closures.

## Key Types

From `src/mcp/plugin-types.ts`:

- **`defineTool(definition)`** - returns a `ToolPlugin`
- **`ToolDefinition<Input>`** - `{ name, title?, description?, inputSchema, outputSchema?, annotations?, _meta?, runtime?, handler }`
- **handler** - `(args, ctx, deps) => CallToolResult | InputRequiredResult` (or a Promise of either)
  - `args`: validated, typed from `inputSchema`
  - `ctx`: `ServerContext` from `@modelcontextprotocol/server` (`ctx.mcpReq.inputResponses`, `ctx.mcpReq.requestState()`, `ctx.mcpReq.log()`, `ctx.mcpReq.notify()`, `ctx.mcpReq._meta`, `ctx.http?.authInfo`)
  - `deps`: `McpServerFactoryContext` from `src/mcp/context.ts` - `{ kv, events, requestState, publicBaseUrl }`
- **`runtime.requiresNet`** - declare it for tools that call out to the network so the permission preflight knows

## Response Helpers

From `src/shared/utils.ts`:

- **`createCallToolTextResponse(obj, structuredContent?)`** - Wraps `obj` as JSON text content. Pass the same object twice for a tool with an `outputSchema`
- **`createCallToolErrorResponse(obj, structuredContent?)`** - Same but sets `isError: true`

## Validation

The SDK validates `args` against `inputSchema` before the handler runs, so do not `safeParse` them again. Use `.default(...)` for optional args with fallbacks (see `increment-counter`). Use `z.object({})` for tools without arguments.

## Output Schema

Declare an `outputSchema` whenever the result has a fixed shape, and return matching `structuredContent`. The SDK validates it, and a mismatch or a missing `structuredContent` turns the call into a tool error. `isError` results and `inputRequired` returns skip that check, so error responses keep their own shape. Multi-round tools whose results differ by outcome, like `elicit-input`, are better without one.

## Error Handling Pattern

Wrap operational logic in try/catch:

```typescript
try {
  const result = await doSomething(args);
  return createCallToolTextResponse({ result });
} catch (error) {
  return createCallToolErrorResponse({
    error: error instanceof Error ? error.message : "Unknown error",
    operation: "my-operation",
  });
}
```

## Tool Categories

### Standard Tool (no client interaction)

Ignore `ctx`/`deps`. See the template above.

### Multi-round tools (`inputRequired`)

Sampling and elicitation are not calls the server makes. The handler returns an `InputRequiredResult`; the client fulfils each request, then **retries the same `tools/call`** with `ctx.mcpReq.inputResponses` populated (keyed by the names you chose) and any `requestState` echoed back. The handler must therefore be re-entrant: check the responses first, ask only for what is missing.

```typescript
import { acceptedContent, inputRequired, inputResponse } from "@modelcontextprotocol/server";
```

Helpers in `src/mcp/inputResponses.ts`: `wasDeclined(ctx, key)`, `samplingText(ctx, key)`, `rootCount(ctx, key)`.

> **Deprecated features:** sampling, roots and logging are deprecated by SEP-2577, still in the spec for at least twelve months. The demos stay so clients can test them, but do not build new features on `inputRequired.createMessage`, `rootCount` or `ctx.mcpReq.log`.

#### Sampling (LLM-powered)

```typescript
handler: ({ prompt }, ctx) => {
  const view = inputResponse(ctx.mcpReq.inputResponses, "poem");
  if (view.kind === "missing") {
    return inputRequired({
      inputRequests: {
        poem: inputRequired.createMessage({
          messages: [{ role: "user", content: { type: "text", text: prompt } }],
          maxTokens: 1024,
        }),
      },
    });
  }
  const poem = samplingText(ctx, "poem");
  if (poem === undefined) return createCallToolErrorResponse({ error: "No text response" });
  return createCallToolTextResponse({ poem });
},
```

#### Form elicitation

| Mode | Use case | Mechanism |
|------|----------|-----------|
| **form** | Structured, non-sensitive fields; validated in the client UI | `inputRequired.elicit({ message, requestedSchema })` (a Zod schema) |
| **url** | Sensitive or browser-only flows (confirmations, OAuth, secrets typed in your page) | `inputRequired.elicitUrl({ message, url })` |

Read the answer with `acceptedContent(ctx.mcpReq.inputResponses, key, schema)` (returns the parsed content or `undefined`) and check `wasDeclined(ctx, key)` for decline/cancel. For several steps, return another `inputRequired` and carry earlier answers in signed `requestState`:

```typescript
return inputRequired({
  inputRequests: { schedule: inputRequired.elicit({ message: "Step 2", requestedSchema: schedule }) },
  requestState: await deps.requestState.mint({ tool: name, basic }, ctx),
});
// next round:
const state = wizardState.safeParse(ctx.mcpReq.requestState());
```

Always put a `tool` discriminator in the minted state and check it on read, so state from another tool cannot be replayed. State is signed with `MCP_REQUEST_STATE_KEY` (32+ bytes; random per process when unset, so set it for multi-instance deployments) and bound to the method and the authenticated client ID. The shared bearer token identifies no client, so in practice that's the method only, and anyone holding state can replay it until it expires (see `src/mcp/requestState.ts`). See `src/mcp/tools/elicitFormWizard.ts`.

#### URL mode

The client opens a **browser URL** you control. In this template:

1. `deps.publicBaseUrl` is the origin for browser links (`MCP_PUBLIC_BASE_URL` or the derived bind URL, `src/shared/publicBaseUrl.ts`); it is `undefined` when HTTP is disabled, so return an error result in that case.
2. Create a pending record in KV (`createUrlElicitation` in `src/mcp/urlElicitation/store.ts`), then return `inputRequired.elicitUrl({ message, url })` with the elicitation id in minted `requestState`.
3. Browser routes live in `src/app/http/urlElicitationRoutes.ts` (`GET`/`POST` `/mcp-elicitation/confirm?elicitation=<uuid>`). They write the outcome to KV; there is no session and no completion notification. When the client retries, the tool reads the record with `getUrlElicitation` and reports `confirmed` / `cancelled` / still `pending` (ask again).
4. Bearer auth is skipped for `/mcp-elicitation` so users are not prompted for the MCP token in a normal browser tab (`src/app/http/httpBearerAuthMiddleware.ts`).
5. Reference implementation: `src/mcp/tools/urlElicitationDemo.ts`.

Do not log secrets submitted on elicitation HTML forms.

### Resource-Backed Tool

Mutate shared state through KV (from `deps`). Subscribers are notified via the KV watcher and `ServerEventBus`:

```typescript
import { COUNTER_URI } from "../resources/counter.ts";
import { incrementPersistedCounterValue } from "../resources/counterStore.ts";

handler: async ({ delta }, _ctx, { kv }) => {
  const value = await incrementPersistedCounterValue(delta, kv);
  const result: z.infer<typeof outputSchema> = { value, delta, uri: COUNTER_URI };
  return createCallToolTextResponse(result, result);
},
```

### Notification Tool (logging)

Use `ctx.mcpReq.log(level, data, logger?)`:

```typescript
handler: async ({ message, level, logger }, ctx) => {
  await ctx.mcpReq.log(level, { message }, logger); // debug | info | notice | warning | error | critical | alert | emergency
  return createCallToolTextResponse({ logged: true });
},
```

### Notification Tool (progress)

Only send progress when the client supplied a token: `ctx.mcpReq._meta?.progressToken`, then `await ctx.mcpReq.notify({ method: "notifications/progress", params: { progressToken, progress, total } })`. See `testToolWithProgress.ts`.

### Notification Tool (list changed)

Publish on the shared bus from `deps`; `subscriptions/listen` streams (HTTP) and the stdio forwarder deliver it:

```typescript
handler: ({ target }, _ctx, { events }) => {
  events.publish({ kind: "tools_list_changed" }); // or prompts_list_changed | resources_list_changed
  return createCallToolTextResponse({ notified: true, target });
},
```

Resource updates use `{ kind: "resource_updated", uri }`.

## Annotations

Every tool declares `annotations`, because clients use them to decide when to ask the user. They are hints, so never rely on them for security. Say what is true of the tool, as the defaults assume the worst (`readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`, `openWorldHint: true`):

| Tool | Annotations |
|------|-------------|
| Reads only, closed domain (`echo`) | `{ readOnlyHint: true, openWorldHint: false }` |
| Reads the open web (`fetch-website-info`) | `{ readOnlyHint: true, openWorldHint: true }` |
| Changes state, additively (`increment-counter`) | `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }` |
| Same result if repeated (`notify-list-changed`) | `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }` |

`destructiveHint` and `idempotentHint` only mean anything when `readOnlyHint` is false.

## Cancellation and Timeouts

`ctx.mcpReq.signal` aborts when the client cancels. Combine it with a timeout and pass the result to anything that takes a signal:

```typescript
const signal = AbortSignal.any([ctx.mcpReq.signal, AbortSignal.timeout(10_000)]);
```

`AbortSignal.timeout` rejects with a `TimeoutError`, not an `AbortError`. The SDK discards a cancelled request's result, so stopping early only saves work.

## Additional Resources

- For complete tool examples by category, see [examples.md](examples.md)
- MCP Tool spec: https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- MCP Sampling: https://modelcontextprotocol.io/docs/concepts/sampling
- MCP Elicitation: https://modelcontextprotocol.io/docs/concepts/elicitation
