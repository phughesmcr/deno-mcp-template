/**
 * @description MCP server related constants
 * @module
 */

import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types";
import { APP_NAME, APP_TITLE, APP_VERSION } from "./app.ts";

/** The MCP server's capabilities. */
export const SERVER_CAPABILITIES: ServerCapabilities = {
  completions: {},
  logging: {},
  prompts: {
    listChanged: true,
  },
  resources: {
    listChanged: true,
    subscribe: true,
  },
  tools: {
    listChanged: true,
  },
  // experimental: {},
};

export const SERVER_INFO = {
  name: APP_NAME,
  title: APP_TITLE,
  version: APP_VERSION,
} as const;
