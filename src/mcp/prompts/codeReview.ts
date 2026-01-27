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
  if (!success) {
    throw new Error(error.message);
  }
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

const prompt: PromptPlugin = [
  name,
  config,
  callback,
];

export default prompt;
