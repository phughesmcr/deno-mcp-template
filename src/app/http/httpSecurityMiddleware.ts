/**
 * Applies Host, Origin and CORS middleware from {@link HttpSecurityPolicy} (ordered security block).
 * @module
 */

import type { Hono } from "hono";
import { cors } from "hono/cors";

import {
  createHostHeaderValidationMiddleware,
  createLocalhostHostValidationMiddleware,
} from "$/app/http/hostHeaderMiddleware.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  CORS_MAX_AGE,
  EXPOSED_HEADERS,
  HEADER_KEYS,
  HTTP_STATUS,
  RPC_ERROR_CODES,
} from "$/shared/constants.ts";
import type { HttpSecurityPolicy } from "$/shared/httpSecurityPolicy.ts";

import type { HonoEnv } from "./honoEnv.ts";

/** Host validation (before secure headers / body limit / rate limit). */
export function applyHttpHostProtectionMiddleware(
  app: Hono<HonoEnv>,
  policy: HttpSecurityPolicy,
): void {
  if (policy.host.kind === "localhost") {
    app.use("*", createLocalhostHostValidationMiddleware());
  } else if (policy.host.kind === "explicit") {
    app.use("*", createHostHeaderValidationMiddleware(policy.host.allowedHostnames));
  }
}

/**
 * Answers 403 on `/mcp` when `Origin` is present and not allowed, as the MCP Streamable HTTP
 * transport requires. CORS alone only stops a browser reading the response, not the request.
 */
export function applyHttpOriginMiddleware(app: Hono<HonoEnv>, policy: HttpSecurityPolicy): void {
  app.use("/mcp", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin === undefined || policy.corsAllowedOrigins.includes(origin)) return await next();
    return c.json({
      jsonrpc: "2.0",
      error: { code: RPC_ERROR_CODES.INVALID_REQUEST, message: "Origin not allowed" },
    }, HTTP_STATUS.FORBIDDEN);
  });
}

/** CORS allowlist. */
export function applyHttpCorsMiddleware(
  app: Hono<HonoEnv>,
  http: AppConfig["http"],
  policy: HttpSecurityPolicy,
): void {
  app.use(cors({
    origin: (origin: string | undefined) => {
      if (!origin) return null;
      return policy.corsAllowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
    maxAge: CORS_MAX_AGE,
    allowMethods: ALLOWED_METHODS,
    allowHeaders: [
      ...ALLOWED_HEADERS,
      ...(http.headers ?? []),
      ...Object.values(HEADER_KEYS),
    ],
    exposeHeaders: [
      ...EXPOSED_HEADERS,
      ...(http.headers ?? []),
      ...Object.values(HEADER_KEYS),
    ],
  }));
}
