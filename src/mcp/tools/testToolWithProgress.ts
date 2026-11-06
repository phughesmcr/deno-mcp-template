import { delay } from "@std/async";
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const TOTAL = 3;

export default defineTool({
  name: "test_tool_with_progress",
  title: "Conformance progress tool",
  description: "Sends progress notifications",
  inputSchema: z.object({}),
  handler: async (_args, ctx) => {
    const progressToken = ctx.mcpReq._meta?.progressToken;
    if (progressToken !== undefined) {
      for (let progress = 1; progress <= TOTAL; progress++) {
        await ctx.mcpReq.notify({
          method: "notifications/progress",
          params: { progressToken, progress, total: TOTAL, message: `p${progress}` },
        });
        if (progress < TOTAL) await delay(20);
      }
    }
    return createCallToolTextResponse({ done: true });
  },
});
