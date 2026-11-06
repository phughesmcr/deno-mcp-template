import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

export default defineTool({
  name: "log-message",
  title: "Log a message",
  description: "Send a structured log message to the client",
  inputSchema: z.object({
    message: z.string().min(1, "Message is required").max(1000, "Message too long"),
    level: z.enum([
      "debug",
      "info",
      "notice",
      "warning",
      "error",
      "critical",
      "alert",
      "emergency",
    ]).default("info"),
    logger: z.string().max(100, "Logger name too long").optional(),
  }),
  handler: async ({ message, level, logger }, ctx) => {
    await ctx.mcpReq.log(level, { message }, logger);
    return createCallToolTextResponse({ logged: true, level, logger: logger ?? null, message });
  },
});
