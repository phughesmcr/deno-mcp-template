/**
 * @description HTTP server related constants
 * @module
 */

/** The default port for the HTTP server. */
export const DEFAULT_PORT = 3001;

/** The default hostname for the HTTP server. */
export const DEFAULT_HOSTNAME = "localhost";

/** The default headers for the MCP server. */
export const HEADERS: string[] = [];

/**
 * The expected hosts for the MCP server's DNS rebinding protection to accept.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Host}
 * @note This is ignored if env.MCP_ALLOWED_HOSTS is set or CLI --host is provided.
 */
export const ALLOWED_HOSTS: string[] = [DEFAULT_HOSTNAME];

/**
 * The expected origins for the MCP server's DNS rebinding protection to accept.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin}
 * @note The presence of "*" will allow all origins.
 * @note This is ignored if env.MCP_ALLOWED_ORIGINS is set or CLI --origin is provided.
 */
export const ALLOWED_ORIGINS: string[] = ["*"];

/**
 * The allowed methods for the MCP server's CORS protection.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Methods}
 * @note GET/POST are required for the HTTP server to function correctly.
 */
export const ALLOWED_METHODS = ["GET", "POST", "DELETE", "OPTIONS"];

/**
 * The allowed headers for the MCP server's CORS protection.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Headers}
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
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers}
 * @note Headers required by the MCP spec are automatically added.
 */
export const EXPOSED_HEADERS = [
  "Content-Type",
  "Authorization",
  "x-api-key",
];

// ********************************************************
// You should not need to change anything below this line.
// ********************************************************

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
