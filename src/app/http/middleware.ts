import type { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";

import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  BODY_LIMIT,
  EXPOSED_HEADERS,
  HEADER_KEYS,
  RPC_ERROR_CODES,
  TIMEOUT,
} from "$/constants";
import type { Config } from "../config.ts";
import type { Logger } from "../logger.ts";

export function configureMiddleware(app: Hono, config: Config, logger: Logger): void {
  app.use("*", secureHeaders());

  if (config.log.level === "debug") {
    app.use(honoLogger((message, ...rest) => {
      logger.debug({
        logger: "Hono HTTP server",
        data: {
          message,
          details: rest,
        },
      });
    }));
  }

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
        }, 413);
      },
    }),
  );

  app.use("*", timeout(TIMEOUT));
  app.use("*", requestId());

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
    origin: (origin: string) => {
      // If wildcard is allowed, accept any origin
      if (config.http.allowedOrigins.includes("*")) {
        return origin;
      }
      // Only return the origin if it's in the allowed list
      if (config.http.allowedOrigins.includes(origin)) {
        return origin;
      }
      return null;
    },
    credentials: true,
    maxAge: 86400,
    allowMethods: ALLOWED_METHODS,
    allowHeaders: [
      ...ALLOWED_HEADERS,
      ...Object.values(HEADER_KEYS),
    ],
    exposeHeaders: [
      ...EXPOSED_HEADERS,
      ...Object.values(HEADER_KEYS),
    ],
  }));
}
