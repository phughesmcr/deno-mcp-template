import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { PromptPlugin } from "$/mcp/plugin-types.ts";

const schema = z.object({
  resourceUri: z.string(),
});

const prompt: PromptPlugin = [
  "test_prompt_with_embedded_resource",
  {
    title: "Conformance embedded resource prompt",
    description: "test_prompt_with_embedded_resource for MCP conformance",
    argsSchema: schema.shape,
  },
  async (args: Record<string, unknown>): Promise<GetPromptResult> => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }
    const uri = parsed.data.resourceUri;
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "resource",
            resource: {
              uri,
              mimeType: "text/plain",
              text: "Embedded resource content for testing.",
            },
          },
        },
        {
          role: "user",
          content: {
            type: "text",
            text: "Additional context for embedded resource.",
          },
        },
      ],
    };
  },
];

export default prompt;
