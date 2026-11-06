/**
 * MCP App UI for the `fetch-website-info` tool: registers `ui://` resource + app tool via ext-apps.
 * @module
 */

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer, ReadResourceResult } from "@modelcontextprotocol/server";
import { fromFileUrl } from "@std/path";

import type { AppPlugin } from "$/mcp/plugin-types.ts";
import {
  executeFetchWebsiteInfo,
  FETCH_WEBSITE_INFO_TOOL_NAME,
  fetchWebsiteInfoInputSchema,
  fetchWebsiteInfoOutputSchema,
  fetchWebsiteInfoToolDescription,
  fetchWebsiteInfoToolTitle,
} from "$/mcp/tools/fetchWebsiteInfoShared.ts";

/** Stable URI referenced by tool `_meta.ui.resourceUri` and the registered resource. */
export const FETCH_WEBSITE_INFO_RESOURCE_URI =
  "ui://deno-mcp-template/fetch-website-info.html" as const;

let cachedAppHtml: string | undefined;

function getAppHtml(): string {
  if (cachedAppHtml !== undefined) return cachedAppHtml;
  const path = fromFileUrl(
    new URL("../../../static/mcp-apps/fetch-website-info.html", import.meta.url),
  );
  try {
    cachedAppHtml = Deno.readTextFileSync(path);
  } catch (cause) {
    throw new Error(
      `MCP App HTML missing at ${path}. Run: deno task build:mcp-ui`,
      { cause },
    );
  }
  return cachedAppHtml;
}

/**
 * Registers the fetch-website-info MCP App resource and tool.
 *
 * We always use {@link registerAppTool} (with `_meta.ui`): hosts without MCP Apps ignore the UI
 * metadata and still consume `content`, and a stateless server has no per-client tool list to
 * vary anyway.
 */
function registerFetchWebsiteInfoApp(server: McpServer): void {
  const html = getAppHtml();

  // The bundle is the same for every client and only changes with a deploy.
  async function readFetchWebsiteInfoResource(): Promise<ReadResourceResult> {
    return {
      contents: [
        {
          uri: FETCH_WEBSITE_INFO_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
        },
      ],
      ttlMs: 60 * 60 * 1000,
      cacheScope: "public",
    };
  }

  registerAppResource(
    server,
    "Fetch website info (MCP App UI)",
    FETCH_WEBSITE_INFO_RESOURCE_URI,
    {},
    readFetchWebsiteInfoResource,
  );

  registerAppTool(
    server,
    FETCH_WEBSITE_INFO_TOOL_NAME,
    {
      title: fetchWebsiteInfoToolTitle,
      description: fetchWebsiteInfoToolDescription,
      inputSchema: fetchWebsiteInfoInputSchema,
      outputSchema: fetchWebsiteInfoOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: FETCH_WEBSITE_INFO_RESOURCE_URI } },
    },
    executeFetchWebsiteInfo,
  );
}

const module: AppPlugin = {
  name: FETCH_WEBSITE_INFO_TOOL_NAME,
  runtime: { requiresNet: true },
  register: registerFetchWebsiteInfoApp,
};

export default module;
