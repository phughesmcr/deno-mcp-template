# MCP Prompt Examples

Complete, working examples from the codebase.

## Simple Prompt - Code Review

`src/mcp/prompts/codeReview.ts`:

```typescript
import { z } from "zod";

import { definePrompt } from "$/mcp/plugin-types.ts";

export default definePrompt({
  name: "review-code",
  title: "Code Review",
  description: "Review code for best practices and potential issues",
  argsSchema: z.object({
    code: z.string().min(1, "Code required").max(50000, "Code too long"),
  }),
  handler: ({ code }) => ({
    messages: [{
      role: "user",
      content: { type: "text", text: `Please review this code:\n\n${code}` },
    }],
  }),
});
```

Key patterns:
- One Zod object is both the argument declaration and the validator
- The handler receives already-validated, typed arguments

---

## Dynamic Prompt - Language Snippet (completable)

`src/mcp/prompts/languagePrompt.ts` uses `completable()` for autocompletion:

```typescript
import { completable } from "@modelcontextprotocol/server";
import { z } from "zod";

import { definePrompt } from "$/mcp/plugin-types.ts";

const languageOptions = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Deno",
];

export default definePrompt({
  name: "language-snippet",
  title: "Language Snippet",
  description: "Generate a short code snippet for a language and goal",
  argsSchema: z.object({
    language: completable(z.string().min(1, "Language is required"), (value: string) => {
      const prefix = value.trim().toLowerCase();
      return languageOptions
        .filter((option) => option.toLowerCase().startsWith(prefix))
        .slice(0, 5);
    }),
    goal: z.string().min(1, "Goal is required"),
  }),
  handler: ({ language, goal }) => ({
    messages: [{
      role: "user",
      content: { type: "text", text: `Write a short ${language} snippet for: ${goal}` },
    }],
  }),
});
```

Key patterns:
- `completable()` wraps a Zod field and adds a completion callback
- The callback receives the current value and returns matching suggestions
- Other fields are plain Zod schemas

---

## Multi-Round Prompt - input_required

`src/mcp/prompts/testInputRequiredPrompt.ts` asks for context before rendering:

```typescript
import { acceptedContent, inputRequired } from "@modelcontextprotocol/server";
import { z } from "zod";

import { definePrompt } from "$/mcp/plugin-types.ts";

const contextForm = z.object({ context: z.string() });

export default definePrompt({
  name: "test_input_required_result_prompt",
  title: "Conformance input_required prompt",
  description: "Asks for context before rendering the prompt",
  argsSchema: z.object({}),
  handler: (_args, ctx) => {
    const answer = acceptedContent(ctx.mcpReq.inputResponses, "user_context", contextForm);
    if (answer) {
      return {
        messages: [{
          role: "user",
          content: { type: "text", text: `Prompt with context: ${answer.context}` },
        }],
      };
    }
    return inputRequired({
      inputRequests: {
        user_context: inputRequired.elicit({
          message: "What context should the prompt use?",
          requestedSchema: contextForm,
        }),
      },
    });
  },
});
```

---

## Registration Module

`src/mcp/prompts/mod.ts`:

```typescript
import type { PromptPlugin } from "$/mcp/plugin-types.ts";
import codeReview from "./codeReview.ts";
import languagePrompt from "./languagePrompt.ts";

export const prompts: readonly PromptPlugin[] = [
  codeReview,
  languagePrompt,
  // ... more prompts
];
```

---

## Minimal Starter

Copy-paste starting point for a new prompt:

```typescript
import { z } from "zod";

import { definePrompt } from "$/mcp/plugin-types.ts";

export default definePrompt({
  name: "TODO-prompt-name",
  title: "TODO title",
  description: "TODO description",
  argsSchema: z.object({
    // TODO: define your arguments (optionally wrap with completable())
  }),
  handler: (args) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `TODO: build prompt text from ${JSON.stringify(args)}`,
      },
    }],
  }),
});
```

Then register in `src/mcp/prompts/mod.ts`:

```typescript
import myPrompt from "./myPrompt.ts";

export const prompts: readonly PromptPlugin[] = [
  // ... existing prompts
  myPrompt,
];
```
