import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import { MINIMAL_PNG_BASE64 } from "$/mcp/showcase/sharedConstants.ts";

const schema = z.object({});

const tool: ToolModule<typeof schema.shape> = [
  "test_image_content",
  {
    title: "Conformance image",
    description: "Returns a minimal PNG",
    inputSchema: schema.shape,
  },
  () => async (): Promise<CallToolResult> => ({
    content: [{
      type: "image",
      data: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
    }],
  }),
];

export default tool;
