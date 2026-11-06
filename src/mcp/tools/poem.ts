import { inputRequired, inputResponse } from "@modelcontextprotocol/server";
import { z } from "zod";

import { samplingText } from "$/mcp/inputResponses.ts";
import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const INPUT_KEY = "poem";

export default defineTool({
  name: "poem",
  title: "Generate a poem",
  description: "Generate a poem for the given prompt",
  inputSchema: z.object({
    prompt: z.string()
      .min(1, "Prompt is required")
      .max(5000, "Prompt too long (max 5000 characters)")
      .describe("The prompt to generate a poem for"),
  }),
  handler: ({ prompt }, ctx) => {
    const view = inputResponse(ctx.mcpReq.inputResponses, INPUT_KEY);
    if (view.kind === "missing") {
      return inputRequired({
        inputRequests: {
          [INPUT_KEY]: inputRequired.createMessage({
            messages: [{
              role: "user",
              content: {
                type: "text",
                text: `Generate a poem for the following prompt:\n\n${prompt}`,
              },
            }],
            maxTokens: 1024,
            temperature: 0.7,
          }),
        },
      });
    }

    const poem = samplingText(ctx, INPUT_KEY);
    if (poem === undefined) {
      return createCallToolErrorResponse({
        error: "No text response from sampling",
        prompt,
        operation: "poem-generation",
      });
    }

    return createCallToolTextResponse({ poem, prompt, timestamp: new Date().toISOString() });
  },
});
