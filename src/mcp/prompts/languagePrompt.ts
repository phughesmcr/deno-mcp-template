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
  if (!success) {
    throw new Error(error.message);
  }

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

const prompt: PromptPlugin = [
  name,
  config,
  callback,
];

export default prompt;
