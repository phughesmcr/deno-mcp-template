import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

import type { PromptPlugin } from "$/mcp/plugin-types.ts";

const prompt: PromptPlugin = [
  "test_simple_prompt",
  {
    title: "Conformance simple prompt",
    description: "test_simple_prompt for MCP conformance",
  },
  async (): Promise<GetPromptResult> => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: "This is a simple prompt for testing.",
      },
    }],
  }),
];

export default prompt;
