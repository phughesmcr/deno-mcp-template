/**
 * @description Two-step form elicitation demo (calendar-style flow).
 * @module
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({});

const name = "elicit-form-wizard";

function cancelledWizardResponse(
  step: 1 | 2,
  action: string,
  partial?: unknown,
): CallToolResult {
  return createCallToolTextResponse(
    partial === undefined ?
      { cancelled: true, step, action } :
      { cancelled: true, step, action, partial },
  );
}

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Form elicitation wizard",
  description:
    "Collect event details in two sequential form elicitation steps (title/description, then date/time).",
  inputSchema: schema.shape,
};

const callback = (mcp: McpServer) => async (args: unknown): Promise<CallToolResult> => {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    return createCallToolErrorResponse({
      error: "Invalid arguments",
      details: parsed.error.flatten(),
      received: args,
    });
  }

  try {
    const basicInfo = await mcp.server.elicitInput({
      mode: "form",
      message: "Step 1: Enter basic event information",
      requestedSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            title: "Event title",
            description: "Name of the event",
            minLength: 1,
          },
          description: {
            type: "string",
            title: "Description",
            description: "Optional details",
          },
        },
        required: ["title"],
      },
    });

    if (basicInfo.action !== "accept" || !basicInfo.content) {
      return cancelledWizardResponse(1, basicInfo.action);
    }

    const dateTime = await mcp.server.elicitInput({
      mode: "form",
      message: "Step 2: Enter date and time",
      requestedSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            title: "Date",
            description: "Event date (ISO or YYYY-MM-DD)",
            minLength: 1,
          },
          startTime: {
            type: "string",
            title: "Start time",
            description: "Start time (e.g. HH:MM)",
            minLength: 1,
          },
        },
        required: ["date", "startTime"],
      },
    });

    if (dateTime.action !== "accept" || !dateTime.content) {
      return cancelledWizardResponse(2, dateTime.action, basicInfo.content);
    }

    const event = { ...basicInfo.content, ...dateTime.content };
    return createCallToolTextResponse({
      event,
      message: "Event draft collected via two-step form elicitation.",
    });
  } catch (error) {
    return createCallToolErrorResponse({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [
  name,
  config,
  callback,
];

export default module;
