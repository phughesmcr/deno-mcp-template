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

export interface HonoBindings {
  clientIp?: string;
}

type HonoEnv = {
  Bindings: HonoBindings;
};

interface RateLimitContextLike {
  env: HonoBindings;
  req: {
    header: (name: string) => string | undefined;
  };
}

export interface HonoAppSpec {
  mcp: McpServer;
  config: AppConfig["http"];
  transports: HTTPTransportManager;
}

function getRateLimitKey(c: RateLimitContextLike): string {
  const clientIp = c.env.clientIp?.trim();
  if (clientIp) {
    return `ip:${clientIp}`;
  }

  const sessionId = c.req.header(HEADER_KEYS.SESSION_ID)?.trim();
  if (sessionId) {
    return `session:${sessionId}`;
  }

  const host = c.req.header("host")?.trim() ?? "no-host";
  const userAgent = c.req.header("user-agent")?.trim() ?? "no-user-agent";
  return `fallback:${host}:${userAgent}`;
}

function configureMiddleware(app: Hono<HonoEnv>, config: AppConfig["http"]): Hono<HonoEnv> {
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
    // @ts-expect-error - rateLimiter does not preserve generic Hono env typing
    rateLimiter({
      windowMs: RATE_LIMIT_WINDOW,
      limit: RATE_LIMIT,
      standardHeaders: "draft-7",
      keyGenerator: (c) => getRateLimitKey(c as RateLimitContextLike),
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

function createRoutes(app: Hono<HonoEnv>, mcp: McpServer, transports: HTTPTransportManager) {
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
export function createHonoApp({ mcp, config, transports }: HonoAppSpec): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();
  configureMiddleware(app, config);
  createRoutes(app, mcp, transports);
  app.onError((err, c) => {
    console.error("Unhandled HTTP route error", err);
    const path = c.req.path;
    if (path === "/mcp") {
      return c.json({
        content: [{ type: "text", text: "Internal error" }],
        isError: true,
      }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    return c.text(err.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  });
  return app;
}
