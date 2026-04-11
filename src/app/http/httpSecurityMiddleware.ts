/**
 * Applies Host + CORS middleware from {@link HttpSecurityPolicy} (ordered security block).
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

/** CORS allowlist (after rate limiter in the stack). */
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
