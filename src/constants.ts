import DenoJson from "../deno.json" with { type: "json" };
import { JSONRPC_VERSION } from "../vendor/schema.ts";

export const KV = await Deno.openKv();

export const APP = {
  NAME: "deno-mcp-template",
  VERSION: DenoJson.version,
} as const;

export const JSONRPC = {
  VERSION: JSONRPC_VERSION,
} as const;

export const HTTP = {
  HEADERS: {
    SESSION_ID: "Mcp-Session-Id",
    LAST_EVENT_ID: "Last-Event-ID",
  },
  STATUS: {
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
  },
} as const;
