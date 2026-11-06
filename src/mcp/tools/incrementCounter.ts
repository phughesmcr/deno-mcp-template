import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";
import { COUNTER_URI } from "../resources/counter.ts";
import { incrementPersistedCounterValue } from "../resources/counterStore.ts";

export default defineTool({
  name: "increment-counter",
  title: "Increment counter",
  description: "Increment a resource-backed counter and notify subscribers",
  inputSchema: z.object({
    delta: z.number().int().min(1, "Delta must be at least 1").max(1000, "Delta too large")
      .default(1),
  }),
  handler: async ({ delta }, _ctx, { kv }) => {
    const value = await incrementPersistedCounterValue(delta, kv);
    return createCallToolTextResponse({ value, delta, uri: COUNTER_URI });
  },
});
