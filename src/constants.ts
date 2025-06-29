/**
 * @description Shared constants for the MCP server
 * @module
 */

import DenoJson from "../deno.json" with { type: "json" };

export const KV = await Deno.openKv();

export const APP_NAME = "deno-mcp-template";
export const APP_VERSION = DenoJson.version;

export const DEFAULT_PORT = 3001;
export const DEFAULT_HOSTNAME = "127.0.0.1";

export const ALLOWED_HOSTS = [];
export const ALLOWED_ORIGINS = [];

export const HEADER_KEYS = {
  SESSION_ID: "mcp-session-id",
  LAST_EVENT_ID: "last-event-id",
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

export const CLI_STRING_ARGS = [
  "port",
  "hostname",
  "memory-file-path",
] as const;

export const CLI_BOOLEAN_ARGS = ["debug", "help", "version"] as const;

export const CLI_ALIAS_ARGS: Partial<
  Record<
    (typeof CLI_STRING_ARGS)[number] | (typeof CLI_BOOLEAN_ARGS)[number],
    string
  >
> = {
  "port": "p",
  "hostname": "h",
  "memory-file-path": "m",
  "debug": "d",
  "help": "H",
  "version": "V",
};

export const ENV_VARS = {
  PORT: "PORT",
  HOSTNAME: "HOSTNAME",
  MEMORY_FILE_PATH: "MEMORY_FILE_PATH",
  DEBUG: "DEBUG",
} as const;
