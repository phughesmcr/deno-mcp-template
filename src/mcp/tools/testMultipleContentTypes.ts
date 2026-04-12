import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import {
  MINIMAL_PNG_BASE64,
  TEST_MIXED_CONTENT_RESOURCE_URI,
} from "$/mcp/showcase/sharedConstants.ts";

const schema = z.object({});

const tool: ToolModule<typeof schema.shape> = [
  "test_multiple_content_types",
  {
    title: "Conformance mixed tool content",
    description: "Text, image, and resource in one result",
    inputSchema: schema.shape,
  },
  () => async (): Promise<CallToolResult> => ({
    content: [
      { type: "text", text: "Mixed content: text line." },
      { type: "image", data: MINIMAL_PNG_BASE64, mimeType: "image/png" },
      {
        type: "resource",
        resource: {
          uri: TEST_MIXED_CONTENT_RESOURCE_URI,
          mimeType: "text/plain",
          text: "mixed",
        },
      },
    ],
  }),
];

export default tool;
