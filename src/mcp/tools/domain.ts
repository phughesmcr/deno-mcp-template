import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const schema = z.object({
  domain: z.string()
    .min(1, "Domain name is required")
    .max(100, "Domain name too long")
    .describe("The domain to fetch information for"),
});

const name = "fetch-domain-info";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Domain Info Fetcher",
  description: "Get information for a domain",
  inputSchema: schema.shape,
};

// deno-lint-ignore no-explicit-any
const callback = (_mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  try {
    // Validate input arguments
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return createCallToolErrorResponse({
        error: "Invalid arguments",
        details: parsed.error.flatten(),
        received: args,
      });
    }

    const { domain } = parsed.data;

    // Add timeout and proper error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(
        `https://api.domainsdb.info/v1/domains/search?domain=${encodeURIComponent(domain)}`,
        { signal: controller.signal },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        return createCallToolErrorResponse({
          error: `Domain API returned error status: ${response.status} ${response.statusText}`,
          domain,
          statusCode: response.status,
          operation: "fetch-domain-info",
        });
      }

      const data = await response.text();

      if (!data.trim()) {
        return createCallToolErrorResponse({
          error: "Domain API returned empty response",
          domain,
          operation: "fetch-domain-info",
        });
      }

      return createCallToolTextResponse({
        domainInfo: data,
        domain,
        timestamp: new Date().toISOString(),
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error) {
        if (fetchError.name === "AbortError") {
          return createCallToolErrorResponse({
            error: "Request timed out after 10 seconds",
            domain,
            operation: "fetch-domain-info",
          });
        }

        return createCallToolErrorResponse({
          error: `Network error: ${fetchError.message}`,
          domain,
          operation: "fetch-domain-info",
          errorType: fetchError.name,
        });
      }

      return createCallToolErrorResponse({
        error: "Unknown network error occurred",
        domain,
        operation: "fetch-domain-info",
      });
    }
  } catch (error) {
    return createCallToolErrorResponse({
      error: error instanceof Error ? error.message : "Unknown error occurred",
      operation: "fetch-domain-info",
      args: args,
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
