import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({
  purpose: z.string().min(1, "Purpose is required").max(200, "Purpose too long"),
});

const name = "collect-user-info";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Collect user info",
  description: "Demonstrate form-based elicitation",
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

  const { purpose } = parsed.data;

  const result = await mcp.server.elicitInput({
    mode: "form",
    message: `Please provide a couple details for: ${purpose}`,
    requestedSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          title: "Name",
          description: "What should we call you?",
        },
        favoriteColor: {
          type: "string",
          title: "Favorite color",
          description: "Just for fun",
        },
      },
      required: ["name"],
    },
  });

  return createCallToolTextResponse({
    elicitationResult: result,
  });
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [
  name,
  config,
  callback,
];

export default module;
