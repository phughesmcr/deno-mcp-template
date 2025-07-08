import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types";

/**
 * @description Shared constants for the MCP server
 * @module
 */

// *****************************************************
// * Configure your MCP server here                    *
// *****************************************************

/** The MCP server's machine-facing name. */
export const APP_NAME = "deno-mcp-template";

/** The MCP server's human-facing title. */
export const APP_TITLE = "Deno MCP Template";

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

/** The default port for the HTTP server. */
export const DEFAULT_PORT = 3001;

/** The default hostname for the HTTP server. */
export const DEFAULT_HOSTNAME = "127.0.0.1";

/** The allowed hosts for the MCP server's DNS rebinding protection. */
export const ALLOWED_HOSTS = [
  `${DEFAULT_HOSTNAME}`,
  `${DEFAULT_HOSTNAME}:${DEFAULT_PORT}`,
  // Add localhost for local development
  // consider deleting this if you're not developing locally
  "localhost",
  `localhost:${DEFAULT_PORT}`,
];

/** The allowed origins for the MCP server's DNS rebinding protection. */
export const ALLOWED_ORIGINS = [
  `http://${DEFAULT_HOSTNAME}`,
  `https://${DEFAULT_HOSTNAME}`,
  `http://${DEFAULT_HOSTNAME}:${DEFAULT_PORT}`,
  `https://${DEFAULT_HOSTNAME}:${DEFAULT_PORT}`,
  // Add localhost for local development
  // consider deleting this if you're not developing locally
  "http://localhost",
  "https://localhost",
  `http://localhost:${DEFAULT_PORT}`,
  `https://localhost:${DEFAULT_PORT}`,
];

/**
 * The allowed methods for the MCP server's CORS protection.
 * @note GET/POST are required by the Express server.
 */
export const ALLOWED_METHODS = ["GET", "POST", "DELETE", "OPTIONS"];

/**
 * The allowed headers for the MCP server's CORS protection.
 * @note Headers required by the MCP spec are automatically added.
 */
export const ALLOWED_HEADERS = [
  "Origin",
  "Content-Type",
  "Accept",
  "Authorization",
  "x-api-key",
  "X-Requested-With",
];

/**
 * The exposed headers for the MCP server's CORS protection.
 * @note Headers required by the MCP spec are automatically added.
 */
export const EXPOSED_HEADERS = [
  "Content-Type",
  "Authorization",
  "x-api-key",
];

/** The app's default log level. */
export const DEFAULT_LOG_LEVEL: LogLevelKey = "info";

// *****************************************************
// * You should not need to change the constants below *
// *****************************************************

import DenoJson from "../deno.json" with { type: "json" };
import type { LogLevelKey } from "./types.ts";

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
  string: ["port", "hostname", "log"],
  boolean: ["help", "version"],
  alias: {
    "help": "H",
    "hostname": "h",
    "log": "l",
    "port": "p",
    "version": "V",
  },
  default: {
    "help": false,
    "hostname": DEFAULT_HOSTNAME,
    "log": DEFAULT_LOG_LEVEL,
    "port": DEFAULT_PORT,
    "version": false,
  },
} as const;

export const ENV_VARS = {
  PORT: "MCP_PORT",
  HOSTNAME: "MCP_HOSTNAME",
  LOG: "MCP_LOG_LEVEL",
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

/** MCP log levels (lower is more severe) */
export const LOG_LEVEL = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
} as const;

export const VALID_LOG_LEVELS = Object.keys(LOG_LEVEL) as (keyof typeof LOG_LEVEL)[];
