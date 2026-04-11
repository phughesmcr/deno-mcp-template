import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fromFileUrl, join } from "@std/path";
import type { Context } from "hono";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/deno";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";

import { createEnsureTransportConnected } from "$/app/http/transportMcpBinding.ts";
import type { UrlElicitationRegistry } from "$/mcp/urlElicitation/registry.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import {
  APP_NAME,
  BODY_LIMIT,
  HTTP_STATUS,
  RATE_LIMIT,
  RATE_LIMIT_UNKNOWN_CLIENT,
  RATE_LIMIT_WINDOW,
  RPC_ERROR_CODES,
  TIMEOUT,
} from "$/shared/constants.ts";
import { httpSecurityPolicyFromHttpConfig } from "$/shared/httpSecurityPolicy.ts";
import { createGetAndDeleteHandler, createPostHandler } from "./handlers.ts";
import type { HonoBindings, HonoEnv } from "./honoEnv.ts";
import { createHttpBearerAuthMiddleware } from "./httpBearerAuthMiddleware.ts";
import {
  applyHttpCorsMiddleware,
  applyHttpHostProtectionMiddleware,
} from "./httpSecurityMiddleware.ts";
import { rateLimitKeyFromIdentity, resolveRateLimitIdentity } from "./rateLimitIdentity.ts";
import { registerUrlElicitationRoutes } from "./urlElicitationRoutes.ts";

import type { HTTPTransportManager } from "./transport.ts";

export type { HonoBindings, HonoEnv };

export interface HonoAppSpec {
  /**
   * Bound factory: returns a **new** `McpServer` per streamable HTTP session. Usually
   * `() => createMcpServer(ctx)` so each session shares the same app `ctx` (e.g. subscriptions).
   */
  createMcpServer: () => McpServer;
  config: AppConfig["http"];
  transports: HTTPTransportManager;
  /** When set, registers `/mcp-elicitation/*` browser routes for URL-mode elicitation. */
  urlElicitationRegistry?: UrlElicitationRegistry;
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
  const httpSecurityPolicy = httpSecurityPolicyFromHttpConfig(config);
  applyHttpHostProtectionMiddleware(app, httpSecurityPolicy);

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

  applyHttpCorsMiddleware(app, config, httpSecurityPolicy);

  app.use(createHttpBearerAuthMiddleware(config.httpBearerToken));

  return app;
}

function createRoutes(
  app: Hono<HonoEnv>,
  createMcpServer: () => McpServer,
  transports: HTTPTransportManager,
  notFoundHtml: string,
  urlElicitationRegistry: UrlElicitationRegistry | undefined,
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

  if (urlElicitationRegistry) {
    registerUrlElicitationRoutes(app, { registry: urlElicitationRegistry, transports });
  }

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
export function createHonoApp(
  { createMcpServer, config, transports, urlElicitationRegistry }: HonoAppSpec,
): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();
  const notFoundHtml = loadNotFoundPageHtml();
  configureMiddleware(app, config);
  createRoutes(app, createMcpServer, transports, notFoundHtml, urlElicitationRegistry);
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
