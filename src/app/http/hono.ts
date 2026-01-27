import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { serveStatic } from "hono/deno";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";

import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  APP_NAME,
  BODY_LIMIT,
  CORS_MAX_AGE,
  DEFAULT_ALLOWED_ORIGINS,
  EXPOSED_HEADERS,
  HEADER_KEYS,
  HTTP_STATUS,
  RATE_LIMIT,
  RATE_LIMIT_WINDOW,
  RPC_ERROR_CODES,
  TIMEOUT,
} from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";
import { createGetAndDeleteHandler, createPostHandler } from "./handlers.ts";
import type { HTTPTransportManager } from "./transport.ts";

export interface HonoAppSpec {
  mcp: McpServer;
  config: AppConfig["http"];
  transports: HTTPTransportManager;
}

function configureMiddleware(app: Hono, config: AppConfig["http"]): Hono {
  app.use(secureHeaders());
  // Apply timeout to all routes except /mcp (SSE streams are long-lived)
  app.use("*", async (c, next) => {
    if (c.req.path === "/mcp") {
      return next();
    }
    return timeout(TIMEOUT)(c, next);
  });
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
        c.req.header("mcp-session-id") ||
        "unknown",
    }),
  );

  const allowedOrigins = config.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;

  app.use(cors({
    origin: (origin: string | undefined) => {
      if (!origin) return null;
      if (allowedOrigins?.includes("*")) return origin;
      return allowedOrigins?.includes(origin) ? origin : null;
    },
    credentials: true,
    maxAge: CORS_MAX_AGE,
    allowMethods: ALLOWED_METHODS,
    allowHeaders: [
      ...ALLOWED_HEADERS,
      ...(config.headers ?? []),
      ...Object.values(HEADER_KEYS),
    ],
    exposeHeaders: [
      ...EXPOSED_HEADERS,
      ...(config.headers ?? []),
      ...Object.values(HEADER_KEYS),
    ],
  }));

  return app;
}

function createRoutes(app: Hono, mcp: McpServer, transports: HTTPTransportManager) {
  // MCP POST route
  const postHandler = createPostHandler(mcp, transports);
  app.post("/mcp", postHandler);

  // MCP GET and DELETE routes
  const getAndDeleteHandler = createGetAndDeleteHandler(mcp, transports);
  app.on(["GET", "DELETE"], "/mcp", getAndDeleteHandler);

  // Static Routes
  app.use("/static/*", serveStatic({ root: "./static" }));
  app.use("/.well-known/*", serveStatic({ root: "./static" }));
  app.use("/favicon.ico", serveStatic({ path: "./static/favicon.ico" }));
  app.get("/llms.txt", (c) => c.redirect("/.well-known/llms.txt"));
  app.get("/openapi.yaml", (c) => c.redirect("/.well-known/openapi.yaml"));
  // ... add more static routes here
  app.get("/", (c) => c.text(`${APP_NAME} running. See \`/llms.txt\` for machine-readable docs.`));

  // 404 Route
  app.notFound((c) => c.html(Deno.readTextFileSync("./static/404.html"), 404));
}

/**
 * Creates a Hono app with properly configured middleware and routes
 * @param spec - The Hono application specification
 * @returns The configured Hono application
 */
export function createHonoApp({ mcp, config, transports }: HonoAppSpec): Hono {
  const app = new Hono();
  configureMiddleware(app, config);
  createRoutes(app, mcp, transports);
  app.onError((err, c) => {
    const path = c.req.path;
    if (path === "/mcp") {
      return c.json({
        content: [{ type: "text", text: err.message }],
        isError: true,
      }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    return c.text(err.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  });
  return app;
}
