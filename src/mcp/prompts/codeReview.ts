/**
 * @type {import("../types.ts").PromptModule<{ code: string }>}
 * @module
 */

import type { GetPromptResult, Prompt } from "@vendor/schema";
import type { PromptModule } from "../../types.ts";

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

const request = async ({ code }: { code: string }): Promise<GetPromptResult> => ({
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
};
