/**
 * Turns a `fetch-website-info` tool result into what the view should show.
 * Free of DOM and host code so it can be tested directly.
 */
import type { CallToolResult } from "@modelcontextprotocol/client";
import { z } from "zod";

/** Mirrors `fetchWebsiteInfoOutputSchema` on the server. */
const websiteInfoSchema = z.object({
  url: z.string(),
  status: z.number().int(),
  statusText: z.string(),
  redirected: z.boolean(),
  headers: z.record(z.string(), z.string()),
  timestamp: z.iso.datetime(),
});

export type WebsiteInfo = z.infer<typeof websiteInfoSchema>;

export type ParsedToolResult =
  | { kind: "success"; data: WebsiteInfo }
  | { kind: "error"; message: string }
  | { kind: "unexpected"; message: string };

const errorBodySchema = z.object({ error: z.string() });

function firstText(result: CallToolResult): string | undefined {
  for (const block of result.content) {
    if (block.type === "text") return block.text;
  }
  return undefined;
}

/** The server reports errors as `{"error": "..."}` text; other tools may send plain text. */
function errorMessage(text: string): string {
  try {
    const body = errorBodySchema.safeParse(JSON.parse(text));
    return body.success ? body.data.error : text;
  } catch {
    return text;
  }
}

/** Classifies a tool result. The host's data is validated, not trusted. */
export function parseToolResult(result: CallToolResult): ParsedToolResult {
  const text = firstText(result);
  if (result.isError) {
    return {
      kind: "error",
      message: text === undefined
        ? "The tool failed without a message."
        : errorMessage(text),
    };
  }
  const info = websiteInfoSchema.safeParse(result.structuredContent);
  if (info.success) return { kind: "success", data: info.data };
  return {
    kind: "unexpected",
    message: text ?? "The tool returned no data this view can show.",
  };
}
