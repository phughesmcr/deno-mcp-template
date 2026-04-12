import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

import type { PromptPlugin } from "$/mcp/plugin-types.ts";
import { MINIMAL_PNG_BASE64 } from "$/mcp/showcase/sharedConstants.ts";

const prompt: PromptPlugin = [
  "test_prompt_with_image",
  {
    title: "Conformance image prompt",
    description: "test_prompt_with_image for MCP conformance",
  },
  async (): Promise<GetPromptResult> => ({
    messages: [
      {
        role: "user",
        content: {
          type: "image",
          data: MINIMAL_PNG_BASE64,
          mimeType: "image/png",
        },
      },
      {
        role: "user",
        content: {
          type: "text",
          text: "Please analyze the image above.",
        },
      },
    ],
  }),
];

export default prompt;
