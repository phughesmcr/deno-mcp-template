import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import { TEST_EMBEDDED_RESOURCE_URI } from "$/mcp/showcase/sharedConstants.ts";

const schema = z.object({});

const tool: ToolModule<typeof schema.shape> = [
  "test_embedded_resource",
  {
    title: "Conformance embedded resource",
    description: "Returns embedded resource content",
    inputSchema: schema.shape,
  },
  () => async (): Promise<CallToolResult> => ({
    content: [{
      type: "resource",
      resource: {
        uri: TEST_EMBEDDED_RESOURCE_URI,
        mimeType: "text/plain",
        text: "Embedded resource body",
      },
    }],
  }),
];

export default tool;
