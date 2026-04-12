import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import { createCallToolErrorResponse } from "$/shared/utils.ts";

const schema = z.object({});

const tool: ToolModule<typeof schema.shape> = [
  "test_error_handling",
  {
    title: "Conformance error tool",
    description: "Returns isError result",
    inputSchema: schema.shape,
  },
  () => async (): Promise<CallToolResult> =>
    createCallToolErrorResponse({
      error: "Intentional conformance error",
    }),
];

export default tool;
