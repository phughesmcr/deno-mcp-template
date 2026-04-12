import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({ prompt: z.string() });

const tool: ToolModule<typeof schema.shape> = [
  "test_sampling",
  {
    title: "Conformance sampling tool",
    description: "Calls createMessage for client sampling",
    inputSchema: schema.shape,
  },
  (mcp: McpServer) => async (args: unknown): Promise<CallToolResult> => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return createCallToolErrorResponse({
        error: "Invalid arguments",
        details: parsed.error.flatten(),
      });
    }
    try {
      const response = await mcp.server.createMessage(
        {
          messages: [{
            role: "user",
            content: { type: "text", text: parsed.data.prompt },
          }],
          maxTokens: 64,
        },
        { timeout: 30_000 },
      );
      const first = Array.isArray(response.content) ? response.content[0] : response.content;
      const text = first && first.type === "text" ? first.text : "";
      return createCallToolTextResponse({ sampled: text });
    } catch (e) {
      return createCallToolErrorResponse({
        error: e instanceof Error ? e.message : "sampling failed",
      });
    }
  },
];

export default tool;
