/**
 * @description MCP Apps: tools with an interactive UI that capable hosts render inline
 * @see {@link https://modelcontextprotocol.io/extensions/overview}
 * @module
 */

import type { AppPlugin } from "$/mcp/plugin-types.ts";
import fetchWebsiteInfoApp from "./fetchWebsiteInfoApp.ts";

export const apps: readonly AppPlugin[] = [
  fetchWebsiteInfoApp,
];
