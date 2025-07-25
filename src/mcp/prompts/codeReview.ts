/**
 * @type {import("$/shared/types.ts").PromptModule<{ code: string }>}
 * @module
 */

import type { GetPromptResult, Prompt } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";

import type { PromptModule } from "$/shared/types.ts";

const schema = z.object({
  code: z.string().min(1, "Code required").max(50000, "Code too long"),
});

const prompt: Prompt = {
  name: "review-code",
  title: "Code Review",
  description: "Review code for best practices and potential issues",
  arguments: [{
    name: "code",
    description: "The code to review",
    required: true,
  }],
};

const request = async ({ code }: z.infer<typeof schema>): Promise<GetPromptResult> => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: `Please review this code:\n\n${code}`,
    },
  }],
});

export const codeReview: PromptModule<{ code: string }> = {
  prompt,
  request,
  schema,
};
