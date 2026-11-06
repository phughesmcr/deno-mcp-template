import { acceptedContent, inputRequired } from "@modelcontextprotocol/server";
import { z } from "zod";

import { wasDeclined } from "$/mcp/inputResponses.ts";
import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const INPUT_KEY = "details";

const details = z.object({
  name: z.string().meta({ title: "Name", description: "What should we call you?" }),
  favoriteColor: z.string().optional().meta({
    title: "Favorite color",
    description: "Just for fun",
  }),
});

export default defineTool({
  name: "elicit-input",
  title: "Elicit input",
  description: "Demonstrate form-based elicitation",
  inputSchema: z.object({
    purpose: z.string().min(1, "Purpose is required").max(200, "Purpose too long"),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: ({ purpose }, ctx) => {
    if (wasDeclined(ctx, INPUT_KEY)) return createCallToolTextResponse({ cancelled: true });

    const answer = acceptedContent(ctx.mcpReq.inputResponses, INPUT_KEY, details);
    if (answer) return createCallToolTextResponse({ purpose, ...answer });

    return inputRequired({
      inputRequests: {
        [INPUT_KEY]: inputRequired.elicit({
          message: `Please provide a couple details for: ${purpose}`,
          requestedSchema: details,
        }),
      },
    });
  },
});
