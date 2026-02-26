# MCP Prompt Examples

Complete, working examples from the codebase.

## Simple Prompt — Code Review (Legacy Arguments)

`src/mcp/prompts/codeReview.ts` uses the `arguments` array style:

```typescript
import type { GetPromptResult, Prompt } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { PromptPlugin } from "$/shared/types.ts";

const schema = z.object({
  code: z.string().min(1, "Code required").max(50000, "Code too long"),
});

const name = "review-code";

const config: Prompt = {
  name,
  title: "Code Review",
  description: "Review code for best practices and potential issues",
  arguments: [{
    name: "code",
    description: "The code to review",
    required: true,
  }],
};

async function callback(args: Record<string, unknown>): Promise<GetPromptResult> {
  const { success, data, error } = schema.safeParse(args);
  if (!success) throw new Error(error.message);

  return {
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please review this code:\n\n${data.code}`,
      },
    }],
  };
}

const prompt: PromptPlugin = [name, config, callback];

export default prompt;
```

Key patterns:
- `Prompt` type from SDK for legacy config
- `arguments` array with `name`, `description`, `required`
- Validation still uses Zod, but arguments are declared manually

---

## Dynamic Prompt — Language Snippet (argsSchema + completable)

`src/mcp/prompts/languagePrompt.ts` uses `argsSchema` with autocompletion:

```typescript
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod/v3";

import type { PromptPlugin } from "$/shared/types.ts";

const languageOptions = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Deno",
];

const schema = z.object({
  language: z.string().min(1, "Language is required"),
  goal: z.string().min(1, "Goal is required"),
});

const name = "language-snippet";

const config = {
  title: "Language Snippet",
  description: "Generate a short code snippet for a language and goal",
  argsSchema: {
    language: completable(schema.shape.language, (value) => {
      const prefix = value.trim().toLowerCase();
      return languageOptions
        .filter((option) => option.toLowerCase().startsWith(prefix))
        .slice(0, 5);
    }),
    goal: schema.shape.goal,
  },
};

async function callback(args: Record<string, unknown>): Promise<GetPromptResult> {
  const { success, data, error } = schema.safeParse(args);
  if (!success) throw new Error(error.message);

  return {
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Write a short ${data.language} snippet for: ${data.goal}`,
      },
    }],
  };
}

const prompt: PromptPlugin = [name, config, callback];

export default prompt;
```

Key patterns:
- `completable()` wraps a Zod field and adds a completion callback
- Completion callback receives current value, returns matching suggestions
- Non-completable fields use the raw Zod shape: `goal: schema.shape.goal`

---

## Registration Module

`src/mcp/prompts/mod.ts`:

```typescript
import type { PromptPlugin } from "$/shared/types.ts";
import codeReview from "./codeReview.ts";
import languagePrompt from "./languagePrompt.ts";

export const prompts: PromptPlugin[] = [
  codeReview,
  languagePrompt,
  // ... more prompts
] as const;
```

---

## Minimal Starter

Copy-paste starting point for a new prompt:

```typescript
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { PromptPlugin } from "$/shared/types.ts";

const schema = z.object({
  // TODO: define your arguments
});

const name = "TODO-prompt-name";

const config = {
  title: "TODO title",
  description: "TODO description",
  argsSchema: {
    // TODO: map schema fields (optionally wrap with completable())
  },
};

async function callback(args: Record<string, unknown>): Promise<GetPromptResult> {
  const { success, data, error } = schema.safeParse(args);
  if (!success) throw new Error(error.message);

  return {
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `TODO: build prompt text from ${JSON.stringify(data)}`,
      },
    }],
  };
}

const prompt: PromptPlugin = [name, config, callback];

export default prompt;
```

Then register in `src/mcp/prompts/mod.ts`:

```typescript
import myPrompt from "./myPrompt.ts";

export const prompts: PromptPlugin[] = [
  // ... existing prompts
  myPrompt,
];
```
