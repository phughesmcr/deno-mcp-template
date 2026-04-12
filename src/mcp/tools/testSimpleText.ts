import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";

const schema = z.object({});

const tool: ToolModule<typeof schema.shape> = [
  "test_simple_text",
  {
    title: "Conformance simple text",
    description: "Returns fixed text for MCP conformance",
    inputSchema: schema.shape,
  },
  () => async (): Promise<CallToolResult> => ({
    content: [{
      type: "text",
      text: "This is a simple text response for testing.",
    }],
  }),
];

export default tool;
