import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({});
type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

const tool: ToolModule<typeof schema.shape> = [
  "test_tool_with_progress",
  {
    title: "Conformance progress tool",
    description: "Sends progress notifications",
    inputSchema: schema.shape,
  },
  () => async (_args: unknown, extra: ToolExtra): Promise<CallToolResult> => {
    const token = extra._meta?.progressToken;
    if (token !== undefined) {
      await extra.sendNotification({
        method: "notifications/progress",
        params: { progressToken: token, progress: 1, total: 3, message: "p1" },
      });
      await new Promise((r) => setTimeout(r, 20));
      await extra.sendNotification({
        method: "notifications/progress",
        params: { progressToken: token, progress: 2, total: 3, message: "p2" },
      });
      await new Promise((r) => setTimeout(r, 20));
      await extra.sendNotification({
        method: "notifications/progress",
        params: { progressToken: token, progress: 3, total: 3, message: "p3" },
      });
    }
    return createCallToolTextResponse({ done: true });
  },
];

export default tool;
