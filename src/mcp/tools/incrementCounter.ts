import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";
import { COUNTER_URI, incrementCounterValue } from "../resources/counter.ts";

const schema = z.object({
  delta: z.number().int().min(1, "Delta must be at least 1").max(1000, "Delta too large")
    .optional(),
});

const name = "increment-counter";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Increment counter",
  description: "Increment a resource-backed counter and notify subscribers",
  inputSchema: schema.shape,
};

// deno-lint-ignore no-explicit-any
const callback = (mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    return createCallToolErrorResponse({
      error: "Invalid arguments",
      details: parsed.error.flatten(),
      received: args,
    });
  }

  const delta = parsed.data.delta ?? 1;
  const value = await incrementCounterValue(delta);

  await mcp.server.sendResourceUpdated({ uri: COUNTER_URI });

  return createCallToolTextResponse({
    value,
    delta,
    uri: COUNTER_URI,
  });
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [
  name,
  config,
  callback,
];

export default module;
