import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolErrorResponse } from "$/shared/utils.ts";

export default defineTool({
  name: "test_error_handling",
  title: "Conformance error tool",
  description: "Returns isError result",
  inputSchema: z.object({}),
  handler: (): CallToolResult =>
    createCallToolErrorResponse({
      error: "Intentional conformance error",
    }),
});
