import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({
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
  ]).optional(),
  logger: z.string().max(100, "Logger name too long").optional(),
});

const name = "log-message";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Log a message",
  description: "Send a structured log message to the client",
  inputSchema: schema.shape,
};

// deno-lint-ignore no-explicit-any
const callback = (mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return createCallToolErrorResponse({
      error: "Invalid arguments",
      details: parsed.error.flatten(),
      received: args,
    });
  }

  const { message, level, logger } = parsed.data;

  await mcp.server.sendLoggingMessage({
    level: level ?? "info",
    logger,
    data: { message },
  });

  return createCallToolTextResponse({
    logged: true,
    level: level ?? "info",
    logger: logger ?? null,
    message,
  });
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [
  name,
  config,
  callback,
];

export default module;
