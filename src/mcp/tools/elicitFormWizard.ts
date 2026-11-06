/**
 * @description Two-step form elicitation demo. Each step is its own `input_required` round, so the
 * first step's answers travel to the next round in signed `requestState`.
 * @module
 */

import { acceptedContent, inputRequired } from "@modelcontextprotocol/server";
import { z } from "zod";

import { wasDeclined } from "$/mcp/inputResponses.ts";
import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

const name = "elicit-form-wizard";

const BASIC_KEY = "basic";
const SCHEDULE_KEY = "schedule";

const basicInfo = z.object({
  title: z.string().min(1).meta({ title: "Event title", description: "Name of the event" }),
  description: z.string().optional().meta({
    title: "Description",
    description: "Optional details",
  }),
});

const schedule = z.object({
  date: z.string().min(1).meta({ title: "Date", description: "Event date (ISO or YYYY-MM-DD)" }),
  startTime: z.string().min(1).meta({
    title: "Start time",
    description: "Start time (e.g. HH:MM)",
  }),
});

/** `tool` stops state minted by another multi-round tool from being replayed here. */
const wizardState = z.object({ tool: z.literal(name), basic: basicInfo });

export default defineTool({
  name,
  title: "Form elicitation wizard",
  description:
    "Collect event details in two sequential form elicitation steps (title/description, then date/time).",
  inputSchema: z.object({}),
  handler: async (_args, ctx, { requestState }) => {
    const responses = ctx.mcpReq.inputResponses;
    const state = wizardState.safeParse(ctx.mcpReq.requestState());

    if (state.success) {
      const { basic } = state.data;
      if (wasDeclined(ctx, SCHEDULE_KEY)) {
        return createCallToolTextResponse({ cancelled: true, step: 2, partial: basic });
      }
      const answer = acceptedContent(responses, SCHEDULE_KEY, schedule);
      if (answer) {
        return createCallToolTextResponse({
          event: { ...basic, ...answer },
          message: "Event draft collected via two-step form elicitation.",
        });
      }
    }

    const basic = state.success ?
      state.data.basic :
      acceptedContent(responses, BASIC_KEY, basicInfo);
    if (!basic) {
      if (wasDeclined(ctx, BASIC_KEY)) {
        return createCallToolTextResponse({ cancelled: true, step: 1 });
      }
      return inputRequired({
        inputRequests: {
          [BASIC_KEY]: inputRequired.elicit({
            message: "Step 1: Enter basic event information",
            requestedSchema: basicInfo,
          }),
        },
      });
    }

    return inputRequired({
      inputRequests: {
        [SCHEDULE_KEY]: inputRequired.elicit({
          message: "Step 2: Enter date and time",
          requestedSchema: schedule,
        }),
      },
      requestState: await requestState.mint({ tool: name, basic }, ctx),
    });
  },
});
