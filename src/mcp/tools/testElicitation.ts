import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({ message: z.string() });

const tool: ToolModule<typeof schema.shape> = [
  "test_elicitation",
  {
    title: "Conformance elicitation",
    description: "Requests username/email via elicitation",
    inputSchema: schema.shape,
  },
  (mcp: McpServer) => async (args: unknown) => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }
    const result = await mcp.server.elicitInput({
      mode: "form",
      message: parsed.data.message,
      requestedSchema: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "User's response",
          },
          email: {
            type: "string",
            description: "User's email address",
          },
        },
        required: ["username", "email"],
      },
    });
    return createCallToolTextResponse({
      text: `User response: action=${result.action}, content=${JSON.stringify(result.content)}`,
    });
  },
];

export default tool;
