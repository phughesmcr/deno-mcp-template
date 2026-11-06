/**
 * Shared logic for the `fetch-website-info` tool (MCP App UI + text fallback).
 * @module
 */

import type { CallToolResult } from "@modelcontextprotocol/server";
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

export type FetchWebsiteInfoSuccess = {
  url: string;
  status: number;
  statusText: string;
  redirected: boolean;
  headers: Record<string, string>;
  timestamp: string;
};

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
): Promise<CallToolResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const { response, redirected } = await headUrlWithSafeRedirects(url, controller.signal);

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
    if (error instanceof Error && error.name === "AbortError") {
      return createCallToolErrorResponse({ error: "Request timed out after 10 seconds", url });
    }
    const message = error instanceof Error ?
      `Network error: ${error.message}` :
      "Unknown network error";
    return createCallToolErrorResponse({ error: message, url });
  } finally {
    clearTimeout(timeoutId);
  }
}
