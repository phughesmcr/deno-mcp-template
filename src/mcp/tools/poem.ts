import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";

const schema = z.object({
  prompt: z.string().describe("The prompt to generate a poem for"),
});

const name = "reflect";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Generate a poem",
  description: "Generate a poem for the given prompt",
  inputSchema: schema.shape,
};

// deno-lint-ignore no-explicit-any
const callback = (mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  // Parse and validate args with full type safety
  const parsed = schema.safeParse(args);

  if (!parsed.success) {
    return Promise.resolve({
      content: [{
        type: "text",
        text: "ERROR: Invalid arguments",
      }],
    });
  }

  const { prompt } = parsed.data;

  // sampling
  const response = await mcp.server.createMessage({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Generate a poem for the following prompt:\n\n${prompt}`,
        },
      },
    ],
    maxTokens: 1024,
    temperature: 0.7,
  });

  if (response.content.type !== "text") {
    return Promise.resolve({
      content: [{
        _meta: {
          isError: true,
        },
        type: "text",
        text: "ERROR: No text response",
      }],
    });
  }

  return Promise.resolve({
    content: [{
      type: "text",
      text: response.content.text,
    }],
  });
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [
  name,
  config,
  callback,
];

export default module;
