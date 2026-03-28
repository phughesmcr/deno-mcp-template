import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { fromFileUrl, join } from "@std/path";
import type { Context } from "hono";
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
  RATE_LIMIT_UNKNOWN_CLIENT,
  RATE_LIMIT_WINDOW,
  RPC_ERROR_CODES,
  TIMEOUT,
} from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";
import {
  createGetAndDeleteHandler,
  createPostHandler,
  type EnsureTransportConnected,
} from "./handlers.ts";
import {
  createHostHeaderValidationMiddleware,
  createLocalhostHostValidationMiddleware,
  resolveHostHeaderProtection,
} from "./hostHeaderMiddleware.ts";
import { createHttpBearerAuthMiddleware } from "./httpBearerAuthMiddleware.ts";
import {
  type RateLimitIdentity,
  rateLimitKeyFromIdentity,
  resolveRateLimitIdentity,
} from "./rateLimitIdentity.ts";
import type { HTTPTransportManager } from "./transport.ts";

export interface HonoBindings {
  clientIp?: string;
}

type HonoEnv = {
  Bindings: HonoBindings;
  Variables: {
    rateLimitIdentity: RateLimitIdentity;
  };
};

export interface HonoAppSpec {
  /**
   * Bound factory: returns a **new** `McpServer` per streamable HTTP session. Usually
   * `() => createMcpServer(ctx)` so each session shares the same app `ctx` (e.g. subscriptions).
   */
  createMcpServer: () => McpServer;
  config: AppConfig["http"];
  transports: HTTPTransportManager;
}

const STATIC_ROOT = fromFileUrl(new URL("../../../static/", import.meta.url));

function loadNotFoundPageHtml(): string {
  try {
    return Deno.readTextFileSync(join(STATIC_ROOT, "404.html"));
  } catch {
    return "<h1>404 Not Found</h1>";
  }
}

function configureMiddleware(app: Hono<HonoEnv>, config: AppConfig["http"]): Hono<HonoEnv> {
  const trustProxy = !!config.trustProxy;

  app.use(async (c, next) => {
    c.set(
      "rateLimitIdentity",
      resolveRateLimitIdentity(
        trustProxy,
        c.env?.clientIp,
        (name) => c.req.header(name),
      ),
    );
    await next();
  });
  const hostProtection = resolveHostHeaderProtection(config);
  if (hostProtection.kind === "localhost") {
    app.use("*", createLocalhostHostValidationMiddleware());
  } else if (hostProtection.kind === "explicit") {
    app.use("*", createHostHeaderValidationMiddleware(hostProtection.allowedHostnames));
  }

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
      limit: (c) => {
        const identity = (c as unknown as Context<HonoEnv>).var.rateLimitIdentity;
        return identity.type === "unknown" ? RATE_LIMIT_UNKNOWN_CLIENT : RATE_LIMIT;
      },
      standardHeaders: "draft-7",
      keyGenerator: (c) =>
        rateLimitKeyFromIdentity((c as unknown as Context<HonoEnv>).var.rateLimitIdentity),
    }),
  );

  const allowedOrigins = config.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;

  app.use(cors({
    origin: (origin: string | undefined) => {
      if (!origin) return null;
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

  app.use(createHttpBearerAuthMiddleware(config.httpBearerToken));

  return app;
}

function createEnsureTransportConnected(
  createMcpServer: () => McpServer,
): EnsureTransportConnected {
  const mcpByTransport = new WeakMap<WebStandardStreamableHTTPServerTransport, McpServer>();
  const connectionByTransport = new WeakMap<
    WebStandardStreamableHTTPServerTransport,
    Promise<void>
  >();

  return async (transport: WebStandardStreamableHTTPServerTransport): Promise<void> => {
    const existingConnection = connectionByTransport.get(transport);
    if (existingConnection) {
      await existingConnection;
      return;
    }

    let mcp = mcpByTransport.get(transport);
    if (!mcp) {
      mcp = createMcpServer();
      mcpByTransport.set(transport, mcp);
    }

    const connection = mcp.connect(transport);
    connectionByTransport.set(transport, connection);

    try {
      await connection;
    } catch (error) {
      connectionByTransport.delete(transport);
      mcpByTransport.delete(transport);
      throw error;
    }
  };
}

function createRoutes(
  app: Hono<HonoEnv>,
  createMcpServer: () => McpServer,
  transports: HTTPTransportManager,
  notFoundHtml: string,
) {
  const ensureTransportConnected = createEnsureTransportConnected(createMcpServer);

  // MCP POST route
  const postHandler = createPostHandler(transports, ensureTransportConnected);
  app.post("/mcp", postHandler);

  // MCP GET and DELETE routes
  const getAndDeleteHandler = createGetAndDeleteHandler(
    transports,
    ensureTransportConnected,
  );
  app.on(["GET", "DELETE"], "/mcp", getAndDeleteHandler);

  // Static Routes
  app.use("/static/*", serveStatic({ root: STATIC_ROOT }));
  app.use("/.well-known/*", serveStatic({ root: STATIC_ROOT }));
  app.use("/favicon.ico", serveStatic({ path: join(STATIC_ROOT, "favicon.ico") }));
  app.get("/llms.txt", (c) => c.redirect("/.well-known/llms.txt"));
  app.get("/openapi.yaml", (c) => c.redirect("/.well-known/openapi.yaml"));
  // ... add more static routes here
  app.get("/", (c) => c.text(`${APP_NAME} running. See \`/llms.txt\` for machine-readable docs.`));

  // 404 Route
  app.notFound((c) => c.html(notFoundHtml, 404));
}

/**
 * Creates a Hono app with properly configured middleware and routes
 * @param spec - The Hono application specification
 * @returns The configured Hono application
 */
export function createHonoApp({ createMcpServer, config, transports }: HonoAppSpec): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();
  const notFoundHtml = loadNotFoundPageHtml();
  configureMiddleware(app, config);
  createRoutes(app, createMcpServer, transports, notFoundHtml);
  app.onError((err, c) => {
    console.error("Unhandled HTTP route error", err);
    const path = c.req.path;
    if (path === "/mcp") {
      return c.json({
        content: [{ type: "text", text: "Internal error" }],
        isError: true,
      }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    return c.text("Internal server error", HTTP_STATUS.INTERNAL_SERVER_ERROR);
  });
  return app;
}
