import { z } from "zod";

import { definePrompt } from "$/mcp/plugin-types.ts";

export default definePrompt({
  name: "test_simple_prompt",
  title: "Conformance simple prompt",
  description: "test_simple_prompt for MCP conformance",
  argsSchema: z.object({}),
  handler: () => ({
    messages: [{
      role: "user",
      content: { type: "text", text: "This is a simple prompt for testing." },
    }],
  }),
});
