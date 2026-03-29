/**
 * Shared logic for the `fetch-website-info` tool (MCP App UI + text fallback).
 * @module
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

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
export async function executeFetchWebsiteInfo(args: unknown): Promise<CallToolResult> {
  try {
    const parsed = fetchWebsiteInfoInputSchema.safeParse(args);
    if (!parsed.success) {
      return createCallToolErrorResponse({
        error: "Invalid arguments",
        details: parsed.error.flatten(),
        received: args,
      });
    }

    const { url } = parsed.data;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await headUrlWithSafeRedirects(url, controller.signal);
      clearTimeout(timeoutId);

      const headers: Record<string, string> = {};
      for (const key of ["content-type", "server", "x-powered-by", "cache-control", "etag"]) {
        const value = response.headers.get(key);
        if (value) headers[key] = value;
      }

      const payload: FetchWebsiteInfoSuccess = {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        redirected: response.redirected,
        headers,
        timestamp: new Date().toISOString(),
      };

      return createCallToolTextResponse(payload, payload as unknown as Record<string, unknown>);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof DisallowedFetchUrlError) {
        return createCallToolErrorResponse({
          error: "URL not allowed",
        });
      }

      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return createCallToolErrorResponse({
          error: "Request timed out after 10 seconds",
          url,
        });
      }

      let networkMessage = "Unknown network error";
      if (fetchError instanceof Error) {
        networkMessage = `Network error: ${fetchError.message}`;
      }
      return createCallToolErrorResponse({
        error: networkMessage,
        url,
      });
    }
  } catch (error) {
    return createCallToolErrorResponse({
      error: error instanceof Error ? error.message : "Unknown error occurred",
      args,
    });
  }
}
