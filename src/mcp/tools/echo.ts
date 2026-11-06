import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";

/** The smallest useful tool: copy this file to start your own. */
export default defineTool({
  name: "echo",
  title: "Echo",
  description: "Return the given message unchanged",
  inputSchema: z.object({
    message: z.string().min(1, "Message is required").max(1000, "Message too long"),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: ({ message }) => ({ content: [{ type: "text", text: message }] }),
});
