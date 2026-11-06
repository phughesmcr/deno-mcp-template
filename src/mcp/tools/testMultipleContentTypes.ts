import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import {
  MINIMAL_PNG_BASE64,
  TEST_MIXED_CONTENT_RESOURCE_URI,
} from "$/mcp/showcase/sharedConstants.ts";

export default defineTool({
  name: "test_multiple_content_types",
  title: "Conformance mixed tool content",
  description: "Text, image, and resource in one result",
  inputSchema: z.object({}),
  handler: (): CallToolResult => ({
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
});
