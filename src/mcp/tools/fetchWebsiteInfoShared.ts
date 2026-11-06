/**
 * Shared logic for the `fetch-website-info` tool (MCP App UI + text fallback).
 * @module
 */

import type { CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";

import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";
import {
  DisallowedFetchUrlError,
  headUrlWithSafeRedirects,
} from "$/shared/validation/safeToolFetchUrl.ts";

export const fetchWebsiteInfoInputSchema = z.object({
  url: z.string()
    .url("Must be a valid URL")
    .max(2000, "URL too long")
    .describe("The URL to fetch information for"),
});

export const FETCH_WEBSITE_INFO_TOOL_NAME = "fetch-website-info";

const FETCH_TIMEOUT_MS = 10_000;

export const fetchWebsiteInfoOutputSchema = z.object({
  url: z.string().describe("The URL that answered, after any redirects"),
  status: z.number().int().describe("HTTP status code"),
  statusText: z.string().describe("HTTP status text"),
  redirected: z.boolean().describe("Whether at least one redirect was followed"),
  headers: z.record(z.string(), z.string()).describe("A selection of the response headers"),
  timestamp: z.iso.datetime().describe("When the response was received"),
});

export type FetchWebsiteInfoSuccess = z.infer<typeof fetchWebsiteInfoOutputSchema>;

/** Tool title and description (shared by registerAppTool). */
export const fetchWebsiteInfoToolTitle = "Website Info Fetcher";

export const fetchWebsiteInfoToolDescription =
  "Fetch basic information about a public HTTPS website (status, headers, server, content type). " +
  "Private IPs, localhost, and metadata endpoints are blocked. Set MCP_DOMAIN_TOOL_ALLOW_HTTP=1 to allow http:// for demos.";

/**
 * Executes the website HEAD fetch and returns a {@link CallToolResult} with
 * `structuredContent` for MCP Apps UI hosts.
 */
export async function executeFetchWebsiteInfo(
  { url }: z.infer<typeof fetchWebsiteInfoInputSchema>,
  ctx: ServerContext,
): Promise<CallToolResult> {
  const signal = AbortSignal.any([ctx.mcpReq.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]);

  try {
    const { response, redirected } = await headUrlWithSafeRedirects(url, signal);

    const headers: Record<string, string> = {};
    for (const key of ["content-type", "server", "x-powered-by", "cache-control", "etag"]) {
      const value = response.headers.get(key);
      if (value) headers[key] = value;
    }

    const payload: FetchWebsiteInfoSuccess = {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      redirected,
      headers,
      timestamp: new Date().toISOString(),
    };

    return createCallToolTextResponse(payload, payload);
  } catch (error) {
    if (error instanceof DisallowedFetchUrlError) {
      return createCallToolErrorResponse({ error: "URL not allowed" });
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return createCallToolErrorResponse({ error: "Request timed out after 10 seconds", url });
    }
    const message = error instanceof Error ?
      `Network error: ${error.message}` :
      "Unknown network error";
    return createCallToolErrorResponse({ error: message, url });
  }
}
