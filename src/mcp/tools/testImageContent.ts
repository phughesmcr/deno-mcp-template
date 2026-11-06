import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { MINIMAL_PNG_BASE64 } from "$/mcp/showcase/sharedConstants.ts";

export default defineTool({
  name: "test_image_content",
  title: "Conformance image",
  description: "Returns a minimal PNG",
  inputSchema: z.object({}),
  handler: (): CallToolResult => ({
    content: [{
      type: "image",
      data: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
    }],
  }),
});
