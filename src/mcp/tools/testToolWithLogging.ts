import { delay } from "@std/async";
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

export default defineTool({
  name: "test_tool_with_logging",
  title: "Conformance logging tool",
  description: "Emits multiple log notifications",
  inputSchema: z.object({}),
  handler: async (_args, ctx) => {
    await ctx.mcpReq.log("debug", { message: "log-1" });
    await delay(50);
    await ctx.mcpReq.log("info", { message: "log-2" });
    await delay(50);
    await ctx.mcpReq.log("notice", { message: "log-3" });
    await delay(120);
    return createCallToolTextResponse({ ok: true });
  },
});
