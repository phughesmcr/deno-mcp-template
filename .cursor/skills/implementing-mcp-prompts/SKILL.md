---
name: implementing-mcp-prompts
description: Implement new MCP prompts in the deno-mcp-template project. Provides the exact file structure, type signatures, registration steps, and patterns for prompts with static arguments or dynamic completions. Use when adding a new prompt, creating MCP prompts, or asking how prompts work in this project.
---

# Implementing MCP Prompts

## Workflow

```
Task Progress:
- [ ] Step 1: Create prompt file in src/mcp/prompts/
- [ ] Step 2: Define Zod schema, name, config, and callback
- [ ] Step 3: Export as default PromptPlugin
- [ ] Step 4: Register in src/mcp/prompts/mod.ts
- [ ] Step 5: Run `deno task ci` to verify
```

## Prompt File Template

Every prompt follows this structure. Create a new file in `src/mcp/prompts/`.

```typescript
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { PromptPlugin } from "$/shared/types.ts";

// 1. Validation schema
const schema = z.object({
  myArg: z.string().min(1, "Required"),
});

// 2. Prompt name (kebab-case)
const name = "my-prompt-name";

// 3. Config — choose one of the two argument styles below
const config = {
  title: "Human-readable title",
  description: "What this prompt does — shown to the LLM",
  argsSchema: {
    myArg: schema.shape.myArg,
  },
};

// 4. Callback — returns GetPromptResult with messages array
async function callback(args: Record<string, unknown>): Promise<GetPromptResult> {
  const { success, data, error } = schema.safeParse(args);
  if (!success) throw new Error(error.message);

  return {
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Do something with: ${data.myArg}`,
      },
    }],
  };
}

// 5. Export as PromptPlugin tuple
const prompt: PromptPlugin = [name, config, callback];

export default prompt;
```

## Registration

In `src/mcp/prompts/mod.ts`:

1. Import the prompt: `import myPrompt from "./myPrompt.ts";`
2. Add it to the `prompts` array:

```typescript
export const prompts: PromptPlugin[] = [
  // ... existing prompts
  myPrompt,
];
```

The server registers each prompt via `server.registerPrompt(...prompt)`.

## Key Type

From `src/shared/types.ts`:

```typescript
export type PromptPlugin = Parameters<McpServer["registerPrompt"]>;
```

This is a tuple: `[name, config, callback]` matching `McpServer.registerPrompt()` parameters.

## Argument Styles

### Style A: `argsSchema` (preferred)

Uses Zod shapes directly. Supports `completable()` for dynamic suggestions.

```typescript
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";

const config = {
  title: "My Prompt",
  description: "...",
  argsSchema: {
    language: completable(schema.shape.language, (value) => {
      const prefix = value.trim().toLowerCase();
      return options.filter((o) => o.toLowerCase().startsWith(prefix)).slice(0, 5);
    }),
    goal: schema.shape.goal,
  },
};
```

### Style B: `arguments` array (legacy)

Uses the `Prompt` type from the SDK. No dynamic completions.

```typescript
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

const config: Prompt = {
  name,
  title: "My Prompt",
  description: "...",
  arguments: [
    { name: "code", description: "The code to review", required: true },
  ],
};
```

## Callback Pattern

Callbacks return `GetPromptResult` — an object with a `messages` array:

```typescript
async function callback(args: Record<string, unknown>): Promise<GetPromptResult> {
  const { success, data, error } = schema.safeParse(args);
  if (!success) throw new Error(error.message);

  return {
    messages: [
      {
        role: "user",
        content: { type: "text", text: `Your prompt text with ${data.myArg}` },
      },
    ],
  };
}
```

Key differences from tool callbacks:
- Receives `args: Record<string, unknown>` (not `any`)
- Returns `GetPromptResult` (not `CallToolResult`)
- Throws on validation failure (not error response objects)
- No `McpServer` parameter — prompts don't need server access
- Can return multiple messages for multi-turn prompt templates

## Multi-Message Prompts

Return multiple messages for system + user prompt patterns:

```typescript
return {
  messages: [
    {
      role: "assistant",
      content: { type: "text", text: "You are a code reviewer..." },
    },
    {
      role: "user",
      content: { type: "text", text: `Review this code:\n\n${data.code}` },
    },
  ],
};
```

## Additional Resources

- For complete prompt examples, see [examples.md](examples.md)
- MCP Prompts spec: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
