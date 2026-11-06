import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const EVENT_KINDS = {
  tools: "tools_list_changed",
  prompts: "prompts_list_changed",
  resources: "resources_list_changed",
} as const;

export default defineTool({
  name: "notify-list-changed",
  title: "Notify list changed",
  description: "Send a list-changed notification for tools, prompts, or resources",
  inputSchema: z.object({
    target: z.enum(["tools", "prompts", "resources"]),
  }),
  handler: ({ target }, _ctx, { events }) => {
    events.publish({ kind: EVENT_KINDS[target] });
    return createCallToolTextResponse({ notified: true, target });
  },
});
