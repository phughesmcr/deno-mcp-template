import { z } from "zod";

import { definePrompt } from "$/mcp/plugin-types.ts";
import { MINIMAL_PNG_BASE64 } from "$/mcp/showcase/sharedConstants.ts";

export default definePrompt({
  name: "test_prompt_with_image",
  title: "Conformance image prompt",
  description: "test_prompt_with_image for MCP conformance",
  argsSchema: z.object({}),
  handler: () => ({
    messages: [
      {
        role: "user",
        content: { type: "image", data: MINIMAL_PNG_BASE64, mimeType: "image/png" },
      },
      {
        role: "user",
        content: { type: "text", text: "Please analyze the image above." },
      },
    ],
  }),
});
