import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({});

/** JSON Schema for SEP-1034 default-value elicitation (conformance suite). */
const sep1034RequestedSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const, default: "John Doe" },
    age: { type: "integer" as const, default: 30 },
    score: { type: "number" as const, default: 95.5 },
    status: {
      type: "string" as const,
      enum: ["active", "inactive", "pending"],
      default: "active",
    },
    verified: { type: "boolean" as const, default: true },
  },
  required: ["name", "age", "score", "status", "verified"],
};

const tool: ToolModule<typeof schema.shape> = [
  "test_elicitation_sep1034_defaults",
  {
    title: "Conformance SEP-1034 defaults",
    description: "Elicitation schema with primitive defaults",
    inputSchema: schema.shape,
  },
  (mcp: McpServer) => async () => {
    const result = await mcp.server.elicitInput({
      mode: "form",
      message: "Please confirm defaults (SEP-1034)",
      requestedSchema: sep1034RequestedSchema,
    });
    return createCallToolTextResponse({
      text: `Elicitation completed: action=${result.action}, content=${
        JSON.stringify(result.content)
      }`,
    });
  },
];

export default tool;
