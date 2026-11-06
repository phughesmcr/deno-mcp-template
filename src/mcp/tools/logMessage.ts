import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const level = z.enum([
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency",
]);

const outputSchema = z.object({
  logged: z.literal(true).describe("Whether the message was sent"),
  level: level.describe("The level it was sent at"),
  logger: z.string().nullable().describe("The logger name, if one was given"),
  message: z.string().describe("The message that was sent"),
});

/** Logging is deprecated by SEP-2577, still in the spec for at least twelve months. */
export default defineTool({
  name: "log-message",
  title: "Log a message",
  description: "Send a structured log message to the client",
  inputSchema: z.object({
    message: z.string().min(1, "Message is required").max(1000, "Message too long"),
    level: level.default("info"),
    logger: z.string().max(100, "Logger name too long").optional(),
  }),
  outputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ message, level, logger }, ctx) => {
    await ctx.mcpReq.log(level, { message }, logger);
    const result: z.infer<typeof outputSchema> = {
      logged: true,
      level,
      logger: logger ?? null,
      message,
    };
    return createCallToolTextResponse(result, result);
  },
});
