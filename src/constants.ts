import DenoJson from "../deno.json" with { type: "json" };

export const KV = await Deno.openKv();

export const MCP_SERVER_NAME = "deno-mcp-template";

export const VERSION = DenoJson.version;

export const SESSION_ID_HEADER = "Mcp-Session-Id";

export const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export const DISCONNECT_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

export const HTTP_SUCCESS_CODE = 200;
export const HTTP_NOT_FOUND_CODE = 404;
export const HTTP_METHOD_NOT_ALLOWED_CODE = 405;
export const HTTP_BAD_REQUEST_CODE = 400;
export const HTTP_INTERNAL_SERVER_ERROR_CODE = 500;
