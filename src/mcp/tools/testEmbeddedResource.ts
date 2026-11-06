import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { TEST_EMBEDDED_RESOURCE_URI } from "$/mcp/showcase/sharedConstants.ts";

export default defineTool({
  name: "test_embedded_resource",
  title: "Conformance embedded resource",
  description: "Returns embedded resource content",
  inputSchema: z.object({}),
  handler: (): CallToolResult => ({
    content: [{
      type: "resource",
      resource: {
        uri: TEST_EMBEDDED_RESOURCE_URI,
        mimeType: "text/plain",
        text: "Embedded resource body",
      },
    }],
  }),
});
