/**
 * Helpers for reading client answers on the retry of an `input_required` round.
 * @module
 */

import {
  type CallToolResult,
  inputResponse,
  type ServerContext,
} from "@modelcontextprotocol/server";

/** A single text content tool result. */
export const text = (value: string): CallToolResult => ({
  content: [{ type: "text", text: value }],
});

/** True when the client answered `key` with an elicitation decline or cancel. */
export function wasDeclined(ctx: ServerContext, key: string): boolean {
  const view = inputResponse(ctx.mcpReq.inputResponses, key);
  return view.kind === "elicit" && view.action !== "accept";
}

/** Text of the sampling answer to `key`, if there is one. */
export function samplingText(ctx: ServerContext, key: string): string | undefined {
  const view = inputResponse(ctx.mcpReq.inputResponses, key);
  if (view.kind !== "sampling") return undefined;
  const { content } = view.result;
  const first = Array.isArray(content) ? content[0] : content;
  return first?.type === "text" ? first.text : undefined;
}

/** Number of roots in the roots answer to `key`, if there is one. */
export function rootCount(ctx: ServerContext, key: string): number | undefined {
  const view = inputResponse(ctx.mcpReq.inputResponses, key);
  return view.kind === "roots" ? view.roots.length : undefined;
}
