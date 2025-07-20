import type { Context, Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";

import {
  BODY_LIMIT,
  DEFAULT_ALLOWED_HEADERS,
  DEFAULT_ALLOWED_METHODS,
  DEFAULT_EXPOSED_HEADERS,
  HEADER_KEYS,
  HTTP_STATUS,
  RPC_ERROR_CODES,
  TIMEOUT,
} from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";

export function configureMiddleware(app: Hono, config: AppConfig): void {
  app.use("*", secureHeaders());
  app.use("*", timeout(TIMEOUT));
  app.use("*", requestId());

  app.use(
    "*",
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
    "*",
    // @ts-expect-error - rateLimiter is not typed correctly for Deno Hono
    rateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      limit: 100, // Limit each IP to 100 requests per window
      standardHeaders: "draft-7",
      keyGenerator: (c) => {
        // Try to get real IP from common headers, fallback to "unknown"
        return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
          c.req.header("x-real-ip") ||
          c.req.header("cf-connecting-ip") ||
          "unknown";
      },
    }),
  );

  app.use(cors({
    origin: (origin: string, c: Context) => {
      if (origin) return origin;
      const referer = c.req.header("referer");
      if (referer) return referer;
      return null;
    },
    credentials: true,
    maxAge: 86400,
    allowMethods: DEFAULT_ALLOWED_METHODS,
    allowHeaders: [
      ...DEFAULT_ALLOWED_HEADERS,
      ...(config.http.headers ?? []),
      ...Object.values(HEADER_KEYS),
    ],
    exposeHeaders: [
      ...DEFAULT_EXPOSED_HEADERS,
      ...(config.http.headers ?? []),
      ...Object.values(HEADER_KEYS),
    ],
  }));
}
