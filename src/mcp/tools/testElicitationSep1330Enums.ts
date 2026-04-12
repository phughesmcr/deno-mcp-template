import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({});

/** JSON Schema for SEP-1330 enum / titled-variant elicitation (conformance suite). */
const sep1330RequestedSchema = {
  type: "object" as const,
  properties: {
    untitledSingle: {
      type: "string" as const,
      enum: ["option1", "option2", "option3"],
    },
    titledSingle: {
      type: "string" as const,
      oneOf: [
        { const: "value1", title: "First Option" },
        { const: "value2", title: "Second Option" },
        { const: "value3", title: "Third Option" },
      ],
    },
    legacyEnum: {
      type: "string" as const,
      enum: ["opt1", "opt2", "opt3"],
      enumNames: ["Option One", "Option Two", "Option Three"],
    },
    untitledMulti: {
      type: "array" as const,
      items: {
        type: "string" as const,
        enum: ["option1", "option2", "option3"],
      },
    },
    titledMulti: {
      type: "array" as const,
      items: {
        anyOf: [
          { const: "value1", title: "First Choice" },
          { const: "value2", title: "Second Choice" },
        ],
      },
    },
  },
  required: [
    "untitledSingle",
    "titledSingle",
    "legacyEnum",
    "untitledMulti",
    "titledMulti",
  ],
};

const tool: ToolModule<typeof schema.shape> = [
  "test_elicitation_sep1330_enums",
  {
    title: "Conformance SEP-1330 enums",
    description: "Elicitation schema with enum variants",
    inputSchema: schema.shape,
  },
  (mcp: McpServer) => async () => {
    const result = await mcp.server.elicitInput({
      mode: "form",
      message: "Please select enum values (SEP-1330)",
      requestedSchema: sep1330RequestedSchema,
    });
    return createCallToolTextResponse({
      text: `Elicitation completed: action=${result.action}, content=${
        JSON.stringify(result.content)
      }`,
    });
  },
];

export default tool;
