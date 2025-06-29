/**
 * @description Shared constants for the MCP server
 * @module
 */

/** The MCP server's machine-facing name. */
export const APP_NAME = "deno-mcp-template";

/** The MCP server's human-facing title. */
export const APP_TITLE = "Deno MCP Template";

/** The allowed hosts for the MCP server's DNS rebinding protection. */
export const ALLOWED_HOSTS = [];

/** The allowed origins for the MCP server's DNS rebinding protection. */
export const ALLOWED_ORIGINS = [];

/** The MCP server's capabilities. */
export const SERVER_CAPABILITIES = {
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

/** The default port for the HTTP server. */
export const DEFAULT_PORT = 3001;

/** The default hostname for the HTTP server. */
export const DEFAULT_HOSTNAME = "127.0.0.1";

// *****************************************************
// * You should not need to change the constants below *
// *****************************************************

import DenoJson from "../deno.json" with { type: "json" };

export const APP_VERSION = DenoJson.version;

export const SERVER_INFO = {
  name: APP_NAME,
  title: APP_TITLE,
  version: APP_VERSION,
} as const;

export const HEADER_KEYS = {
  SESSION_ID: "mcp-session-id",
  LAST_EVENT_ID: "last-event-id",
} as const;

export const CLI_ARGS = {
  string: ["port", "hostname", "memory-file-path"],
  boolean: ["debug", "help", "version"],
  alias: {
    "port": "p",
    "hostname": "h",
    "memory-file-path": "m",
    "debug": "d",
    "help": "H",
    "version": "V",
  },
  default: {
    "port": DEFAULT_PORT,
    "hostname": DEFAULT_HOSTNAME,
    "memory-file-path": null,
    "debug": false,
    "help": false,
    "version": false,
  },
} as const;

export const ENV_VARS = {
  PORT: "PORT",
  HOSTNAME: "HOSTNAME",
  MEMORY_FILE_PATH: "MEMORY_FILE_PATH",
  DEBUG: "DEBUG",
} as const;

export const HTTP_STATUS = {
  SUCCESS: 200,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;
