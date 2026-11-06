import { z } from "zod";

import { definePrompt } from "$/mcp/plugin-types.ts";

export default definePrompt({
  name: "test_prompt_with_embedded_resource",
  title: "Conformance embedded resource prompt",
  description: "test_prompt_with_embedded_resource for MCP conformance",
  argsSchema: z.object({ resourceUri: z.string() }),
  handler: ({ resourceUri }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "resource",
          resource: {
            uri: resourceUri,
            mimeType: "text/plain",
            text: "Embedded resource content for testing.",
          },
        },
      },
      {
        role: "user",
        content: { type: "text", text: "Additional context for embedded resource." },
      },
    ],
  }),
});
