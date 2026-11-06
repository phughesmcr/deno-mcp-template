/**
 * @description Demo tool for URL-mode elicitation. The browser page records the outcome in KV; the
 * client's retry carries the elicitation id back in signed `requestState` and reads it from there.
 * @module
 */

import { inputRequired, type ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { McpServerFactoryContext } from "$/mcp/context.ts";
import { wasDeclined } from "$/mcp/inputResponses.ts";
import { defineTool } from "$/mcp/plugin-types.ts";
import { createUrlElicitation, getUrlElicitation } from "$/mcp/urlElicitation/store.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const name = "url-elicitation-demo";
const INPUT_KEY = "browser_confirmation";

/** `tool` stops state minted by another multi-round tool from being replayed here. */
const demoState = z.object({ tool: z.literal(name), elicitationId: z.uuid() });

async function askForConfirmation(
  elicitationId: string,
  baseUrl: string,
  ctx: ServerContext,
  deps: McpServerFactoryContext,
) {
  const url = new URL("/mcp-elicitation/confirm", `${baseUrl}/`);
  url.searchParams.set("elicitation", elicitationId);
  return inputRequired({
    inputRequests: {
      [INPUT_KEY]: inputRequired.elicitUrl({
        message: "Open the link in your browser to confirm or cancel this demo action.",
        url: url.href,
      }),
    },
    requestState: await deps.requestState.mint({ tool: name, elicitationId }, ctx),
  });
}

export default defineTool({
  name,
  title: "URL elicitation demo",
  description: "Requires confirming an action in the browser (URL-mode elicitation). " +
    "Needs the HTTP server, which hosts the confirmation page.",
  inputSchema: z.object({
    label: z.string()
      .min(1, "Label is required")
      .max(200, "Label too long")
      .describe("Short text shown on the browser confirmation page"),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ label }, ctx, deps) => {
    const { publicBaseUrl } = deps;
    if (!publicBaseUrl) {
      return createCallToolErrorResponse({
        error: "HTTP is disabled; URL elicitation is not available.",
      });
    }

    const kv = await deps.kv.get();
    const state = demoState.safeParse(ctx.mcpReq.requestState());
    if (!state.success) {
      const id = await createUrlElicitation(kv, label);
      return await askForConfirmation(id, publicBaseUrl, ctx, deps);
    }

    if (wasDeclined(ctx, INPUT_KEY)) return createCallToolTextResponse({ cancelled: true, label });

    const { elicitationId } = state.data;
    const record = await getUrlElicitation(kv, elicitationId);
    switch (record?.status) {
      case "confirmed":
        return createCallToolTextResponse({ confirmed: true, label: record.label });
      case "cancelled":
        return createCallToolErrorResponse({ error: "Cancelled in the browser." });
      case "pending":
        return await askForConfirmation(elicitationId, publicBaseUrl, ctx, deps);
      default:
        return createCallToolErrorResponse({ error: "The confirmation link has expired." });
    }
  },
});
