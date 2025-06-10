import { join } from "@std/path";

import DenoJson from "../deno.json" with { type: "json" };

export const KV = await Deno.openKv();

export const APP_NAME = "deno-mcp-template";
export const APP_VERSION = DenoJson.version;

export const DEFAULT_PORT = 3001;
export const DEFAULT_HOSTNAME = "127.0.0.1";

export const SESSION_ID_KEY = "Mcp-Session-Id";
export const LAST_EVENT_ID_KEY = "Last-Event-Id";

export const MEMORY_PATH_KEY = "MEMORY_FILE_PATH";
export const MEMORY_FILE_PATH = join(import.meta.dirname ?? "", "memory.json");

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
