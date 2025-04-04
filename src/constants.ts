import DenoJson from "../deno.json" with { type: "json" };

export const KV = await Deno.openKv();

export const MCP_SERVER_NAME = "deno-mcp-template";

export const VERSION = DenoJson.version;

export const SESSION_ID_HEADER = "Mcp-Session-Id";

export const LAST_EVENT_ID_HEADER = "Last-Event-ID";

export const SSE_MESSAGE_ENDPOINT = "/message";

export const THIRTY_MINUTES = 30 * 60 * 1000;

export const THIRTY_SECONDS = 30 * 1000;

export const MAXIMUM_MESSAGE_SIZE = 4 * 1024 * 1024; // 4MB

export const HTTP_SUCCESS_CODE = 200;
export const HTTP_ACCEPTED_CODE = 202;
export const HTTP_NO_CONTENT_CODE = 204;
export const HTTP_BAD_REQUEST_CODE = 400;
export const HTTP_UNAUTHORIZED_CODE = 401;
export const HTTP_FORBIDDEN_CODE = 403;
export const HTTP_NOT_FOUND_CODE = 404;
export const HTTP_METHOD_NOT_ALLOWED_CODE = 405;
export const HTTP_NOT_ACCEPTABLE_CODE = 406;
export const HTTP_INTERNAL_SERVER_ERROR_CODE = 500;
