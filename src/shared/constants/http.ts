/**
 * @description HTTP server related constants
 * @module
 */

/** The default port for the HTTP server. */
export const DEFAULT_PORT = 3001;

/** The default hostname for the HTTP server. */
export const DEFAULT_HOSTNAME = "localhost";

/** Hostnames that bind all interfaces (require DNS rebinding + host allowlist when HTTP is enabled). */
const ALL_INTERFACES_BIND_HOSTNAMES = new Set([
  "0.0.0.0",
  "::",
  "[::]",
]);

/** True when {@linkcode hostname} binds every interface (e.g. `0.0.0.0`, `::`). */
export function isAllInterfacesBindHostname(hostname: string): boolean {
  return ALL_INTERFACES_BIND_HOSTNAMES.has(hostname.trim().toLowerCase());
}

/**
 * The expected origins for the MCP server's DNS rebinding protection to accept.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin}
 * @note Wildcard origins are not supported; list each origin explicitly.
 * @note This is ignored if env.MCP_ALLOWED_ORIGINS is set or CLI --origin is provided.
 */
export const DEFAULT_ALLOWED_ORIGINS: string[] = [];

/**
 * The allowed methods for the MCP server's CORS protection.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Methods}
 * @note Every MCP request, including `subscriptions/listen`, is a POST.
 */
export const ALLOWED_METHODS = ["POST"];

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
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
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

/** Maximum request body size. Enforced by Hono `bodyLimit` and passed to `createMcpHandler` as `maxRequestBodySize`. */
export const BODY_LIMIT = 1024 * 1024 * 4; // 4MB

/** Request timeout in ms for every HTTP route except `/mcp` (whose `subscriptions/listen` streams are long-lived). */
export const TIMEOUT = 60000; // 60 seconds

/** The rate limit window for the MCP server. */
export const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

/** The rate limit for the MCP server. */
export const RATE_LIMIT = 100; // Limit each IP to 100 requests per window

/**
 * Stricter limit for clients with no socket IP and no trusted proxy headers (when enabled).
 */
export const RATE_LIMIT_UNKNOWN_CLIENT = 20;

/** The maximum age for the MCP server's CORS protection. */
export const CORS_MAX_AGE = 86400; // 24 hours

/** Required headers for the MCP server. */
export const HEADER_KEYS = {
  MCP_PROTOCOL_VERSION: "mcp-protocol-version",
  MCP_METHOD: "mcp-method",
  MCP_NAME: "mcp-name",
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
  CONTENT_TOO_LARGE: 413,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;
