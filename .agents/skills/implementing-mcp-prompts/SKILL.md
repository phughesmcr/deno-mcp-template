---
name: implementing-mcp-prompts
description: Implement new MCP prompts in the deno-mcp-template project. Provides the exact file structure, type signatures, registration steps, and patterns for prompts with arguments, dynamic completions, and multi-round input. Use when adding a new prompt, creating MCP prompts, or asking how prompts work in this project.
---

# Implementing MCP Prompts

## Workflow

```
Task Progress:
- [ ] Step 1: Create prompt file in src/mcp/prompts/
- [ ] Step 2: Define a Zod args schema and call definePrompt({ name, argsSchema, handler })
- [ ] Step 3: Export the result as the default export
- [ ] Step 4: Register in src/mcp/prompts/mod.ts
- [ ] Step 5: Run `deno fmt`, then `deno task ci` to verify
```

## Prompt File Template

Every prompt follows this structure. Create a new file in `src/mcp/prompts/`.

```typescript
import { z } from "zod";

import { definePrompt } from "$/mcp/plugin-types.ts";

export default definePrompt({
  name: "my-prompt-name", // kebab-case
  title: "Human-readable title",
  description: "What this prompt does - shown to the LLM",
  argsSchema: z.object({
    myArg: z.string().min(1, "Required"),
  }),
  handler: ({ myArg }) => ({
    messages: [{
      role: "user",
      content: { type: "text", text: `Do something with: ${myArg}` },
    }],
  }),
});
```

## Registration

In `src/mcp/prompts/mod.ts`:

1. Import the prompt: `import myPrompt from "./myPrompt.ts";`
2. Add it to the `prompts` array:

```typescript
export const prompts: readonly PromptPlugin[] = [
  // ... existing prompts
  myPrompt,
];
```

`createMcpServer` (`src/mcp/mod.ts`) calls `prompt.register(server, deps)` for each entry.

## Key Types

From `src/mcp/plugin-types.ts`:

- **`definePrompt(definition)`** - returns a `PromptPlugin`
- **`PromptDefinition<Args>`** - `{ name, title?, description?, argsSchema, handler }`
- **handler** - `(args, ctx, deps) => GetPromptResult | InputRequiredResult` (or a Promise of either)
  - `args`: validated, typed from `argsSchema`
  - `ctx`: `ServerContext` from `@modelcontextprotocol/server`
  - `deps`: `McpServerFactoryContext` (`kv`, `events`, `requestState`, `publicBaseUrl`)

## Arguments

`argsSchema` is a Zod object (any Standard Schema with JSON Schema support works). Use `z.object({})` for prompts without arguments. Wrap a field with `completable()` for dynamic suggestions:

```typescript
import { completable } from "@modelcontextprotocol/server";

argsSchema: z.object({
  language: completable(z.string().min(1, "Language is required"), (value: string) => {
    const prefix = value.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().startsWith(prefix)).slice(0, 5);
  }),
  goal: z.string().min(1, "Goal is required"),
}),
```

## Handler Pattern

Handlers return `GetPromptResult` - an object with a `messages` array:

```typescript
handler: ({ myArg }) => ({
  messages: [
    { role: "user", content: { type: "text", text: `Your prompt text with ${myArg}` } },
  ],
}),
```

Key differences from tool handlers:
- Returns `GetPromptResult` (not `CallToolResult`)
- Arguments are already validated; no `safeParse`
- Unused `ctx` and `deps` parameters can be omitted
- Can return multiple messages for multi-turn prompt templates

## Multi-Round Prompts

A prompt may return `inputRequired(...)` to collect input (form elicitation) before rendering. The client retries `prompts/get` with `ctx.mcpReq.inputResponses` populated. See `src/mcp/prompts/testInputRequiredPrompt.ts` and the tools skill for `requestState`.

```typescript
import { acceptedContent, inputRequired } from "@modelcontextprotocol/server";

handler: (_args, ctx) => {
  const answer = acceptedContent(ctx.mcpReq.inputResponses, "user_context", contextForm);
  if (answer) return { messages: [/* ... */] };
  return inputRequired({
    inputRequests: {
      user_context: inputRequired.elicit({ message: "What context?", requestedSchema: contextForm }),
    },
  });
},
```

## Multi-Message Prompts

Return multiple messages for system + user prompt patterns:

```typescript
return {
  messages: [
    { role: "assistant", content: { type: "text", text: "You are a code reviewer..." } },
    { role: "user", content: { type: "text", text: `Review this code:\n\n${code}` } },
  ],
};
```

## Additional Resources

- For complete prompt examples, see [examples.md](examples.md)
- MCP Prompts spec: https://modelcontextprotocol.io/specification/2026-07-28/server/prompts
