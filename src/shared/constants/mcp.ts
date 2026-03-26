/**
 * @description MCP server related constants
 * @module
 */

import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types";
import { APP_NAME, APP_TITLE, APP_VERSION } from "./app.ts";

/**
 * MCP Apps extension id ({@link https://modelcontextprotocol.io/extensions/overview#negotiation}).
 * Advertised so UI-capable clients can negotiate; SDK `ServerCapabilities` type may omit `extensions`.
 */
const MCP_APPS_EXTENSION_ID = "io.modelcontextprotocol/ui";

/** The MCP server's capabilities. */
export const SERVER_CAPABILITIES: ServerCapabilities & {
  extensions: Record<string, Record<string, unknown>>;
} = {
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
  tasks: {
    list: {},
    cancel: {},
    requests: {
      tools: {
        call: {},
      },
    },
  },
  experimental: {
    elicitation: {},
  },
  extensions: {
    [MCP_APPS_EXTENSION_ID]: {},
  },
};

// ********************************************************
// You should not need to change anything below this line.
// ********************************************************

export const SERVER_INFO = {
  name: APP_NAME,
  title: APP_TITLE,
  version: APP_VERSION,
} as const;

export const INVALID_SESSION_ID = "-1";
