import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({});

const tool: ToolModule<typeof schema.shape> = [
  "test_tool_with_logging",
  {
    title: "Conformance logging tool",
    description: "Emits multiple log notifications",
    inputSchema: schema.shape,
  },
  (mcp: McpServer) => async (): Promise<CallToolResult> => {
    await mcp.server.sendLoggingMessage({
      level: "debug",
      data: { message: "log-1" },
    });
    await new Promise((r) => setTimeout(r, 50));
    await mcp.server.sendLoggingMessage({
      level: "info",
      data: { message: "log-2" },
    });
    await new Promise((r) => setTimeout(r, 50));
    await mcp.server.sendLoggingMessage({
      level: "notice",
      data: { message: "log-3" },
    });
    await new Promise((r) => setTimeout(r, 120));
    return createCallToolTextResponse({ ok: true });
  },
];

export default tool;
