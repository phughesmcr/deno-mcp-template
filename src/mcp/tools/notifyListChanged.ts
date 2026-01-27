import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({
  target: z.enum(["tools", "prompts", "resources"]),
});

const name = "notify-list-changed";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Notify list changed",
  description: "Send a list-changed notification for tools, prompts, or resources",
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

  const { target } = parsed.data;

  switch (target) {
    case "tools":
      mcp.sendToolListChanged();
      break;
    case "prompts":
      mcp.sendPromptListChanged();
      break;
    case "resources":
      mcp.sendResourceListChanged();
      break;
  }

  return createCallToolTextResponse({
    notified: true,
    target,
  });
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [
  name,
  config,
  callback,
];

export default module;
