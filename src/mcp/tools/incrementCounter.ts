import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";
import { COUNTER_URI } from "../resources/counter.ts";
import { incrementPersistedCounterValue } from "../resources/counterStore.ts";

const outputSchema = z.object({
  value: z.number().int().describe("The counter after this increment"),
  delta: z.number().int().describe("The amount added"),
  uri: z.string().describe("The resource holding the counter"),
});

export default defineTool({
  name: "increment-counter",
  title: "Increment counter",
  description: "Increment a resource-backed counter and notify subscribers",
  inputSchema: z.object({
    delta: z.number().int().min(1, "Delta must be at least 1").max(1000, "Delta too large")
      .default(1),
  }),
  outputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ delta }, _ctx, { kv }) => {
    const value = await incrementPersistedCounterValue(delta, kv);
    const result: z.infer<typeof outputSchema> = { value, delta, uri: COUNTER_URI };
    return createCallToolTextResponse(result, result);
  },
});
