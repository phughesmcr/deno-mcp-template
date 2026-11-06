import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";

export default defineTool({
  name: "test_simple_text",
  title: "Conformance simple text",
  description: "Returns fixed text for MCP conformance",
  inputSchema: z.object({}),
  handler: (): CallToolResult => ({
    content: [{
      type: "text",
      text: "This is a simple text response for testing.",
    }],
  }),
});
