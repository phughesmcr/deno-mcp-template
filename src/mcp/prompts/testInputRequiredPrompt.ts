import { acceptedContent, inputRequired } from "@modelcontextprotocol/server";
import { z } from "zod";

import { definePrompt } from "$/mcp/plugin-types.ts";

const contextForm = z.object({ context: z.string() });

export default definePrompt({
  name: "test_input_required_result_prompt",
  title: "Conformance input_required prompt",
  description: "Asks for context before rendering the prompt",
  argsSchema: z.object({}),
  handler: (_args, ctx) => {
    const answer = acceptedContent(ctx.mcpReq.inputResponses, "user_context", contextForm);
    if (answer) {
      return {
        messages: [{
          role: "user",
          content: { type: "text", text: `Prompt with context: ${answer.context}` },
        }],
      };
    }
    return inputRequired({
      inputRequests: {
        user_context: inputRequired.elicit({
          message: "What context should the prompt use?",
          requestedSchema: contextForm,
        }),
      },
    });
  },
});
