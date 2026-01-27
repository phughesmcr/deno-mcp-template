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
