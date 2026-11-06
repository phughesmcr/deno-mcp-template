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
