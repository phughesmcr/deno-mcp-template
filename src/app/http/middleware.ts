import type { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";

import {
  BODY_LIMIT,
  CORS_MAX_AGE,
  DEFAULT_ALLOWED_HEADERS,
  DEFAULT_ALLOWED_METHODS,
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_EXPOSED_HEADERS,
  HEADER_KEYS,
  HTTP_STATUS,
  RATE_LIMIT,
  RATE_LIMIT_WINDOW,
  RPC_ERROR_CODES,
  TIMEOUT,
} from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";

export function configureMiddleware(app: Hono, config: AppConfig["http"]): Hono {
  app.use(secureHeaders());
  app.use(timeout(TIMEOUT));
  app.use(requestId());

  app.use(
    bodyLimit({
      maxSize: BODY_LIMIT,
      onError: (c) => {
        return c.json({
          isError: true,
          details: {
            error: "Request body too large",
            code: RPC_ERROR_CODES.INVALID_REQUEST,
            message: "Request body too large",
          },
        }, HTTP_STATUS.CONTENT_TOO_LARGE);
      },
    }),
  );

  app.use(
    // @ts-expect-error - rateLimiter is not typed correctly for Deno Hono
    rateLimiter({
      windowMs: RATE_LIMIT_WINDOW,
      limit: RATE_LIMIT,
      standardHeaders: "draft-7",
      keyGenerator: (c) =>
        c.req.header(HEADER_KEYS.SESSION_ID) ||
        c.req.header("x-forwarded-for") ||
        c.req.header("x-real-ip") ||
        "unknown",
    }),
  );

  app.use(cors({
    origin: (origin: string) => {
      if (!origin) return null;
      if (DEFAULT_ALLOWED_ORIGINS.includes("*")) return origin;
      return DEFAULT_ALLOWED_ORIGINS.includes(origin) ? origin : null;
    },
    credentials: true,
    maxAge: CORS_MAX_AGE,
    allowMethods: DEFAULT_ALLOWED_METHODS,
    allowHeaders: [
      ...DEFAULT_ALLOWED_HEADERS,
      ...(config.headers ?? []),
      ...Object.values(HEADER_KEYS),
    ],
    exposeHeaders: [
      ...DEFAULT_EXPOSED_HEADERS,
      ...(config.headers ?? []),
      ...Object.values(HEADER_KEYS),
    ],
  }));

  return app;
}
