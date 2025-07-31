import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({
  prompt: z.string().describe("The prompt to generate a poem for"),
});

const name = "poem";

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
    return createCallToolErrorResponse({
      error: "Invalid arguments",
      details: parsed.error.flatten(),
      received: args,
    });
  }

  const { prompt } = parsed.data;

  try {
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
      return createCallToolErrorResponse({
        error: "No text response from sampling",
        prompt,
        responseType: response.content.type,
        operation: "poem-generation",
      });
    }

    return createCallToolTextResponse({
      poem: response.content.text,
      prompt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createCallToolErrorResponse({
      error: error instanceof Error ? error.message : "Unknown error during poem generation",
      prompt,
      operation: "poem-generation",
    });
  }
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [
  name,
  config,
  callback,
];

export default module;
