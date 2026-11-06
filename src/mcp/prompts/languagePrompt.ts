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
