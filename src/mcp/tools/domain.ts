import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({
  url: z.string()
    .url("Must be a valid URL")
    .max(2000, "URL too long")
    .describe("The URL to fetch information for"),
});

const name = "fetch-website-info";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Website Info Fetcher",
  description: "Fetch basic information about a website (status, headers, server, content type)",
  inputSchema: schema.shape,
};

// deno-lint-ignore no-explicit-any
const callback = (_mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  try {
    const parsed = schema.safeParse(args);
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
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeoutId);

      const headers: Record<string, string> = {};
      for (const key of ["content-type", "server", "x-powered-by", "cache-control", "etag"]) {
        const value = response.headers.get(key);
        if (value) headers[key] = value;
      }

      return createCallToolTextResponse({
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        redirected: response.redirected,
        headers,
        timestamp: new Date().toISOString(),
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return createCallToolErrorResponse({
          error: "Request timed out after 10 seconds",
          url,
        });
      }

      return createCallToolErrorResponse({
        error: fetchError instanceof Error ?
          `Network error: ${fetchError.message}` :
          "Unknown network error",
        url,
      });
    }
  } catch (error) {
    return createCallToolErrorResponse({
      error: error instanceof Error ? error.message : "Unknown error occurred",
      args,
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
