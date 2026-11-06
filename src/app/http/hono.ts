import type { McpHttpHandler } from "@modelcontextprotocol/server";
import { fromFileUrl, join } from "@std/path";
import type { Context } from "hono";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/deno";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";

import type { KvRuntime } from "$/kv/runtime.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import { APP_NAME, BODY_LIMIT, HTTP_STATUS, RPC_ERROR_CODES, TIMEOUT } from "$/shared/constants.ts";
import { httpSecurityPolicyFromHttpConfig } from "$/shared/httpSecurityPolicy.ts";
import type { HonoBindings, HonoEnv } from "./honoEnv.ts";
import { createHttpBearerAuthMiddleware } from "./httpBearerAuthMiddleware.ts";
import {
  applyHttpCorsMiddleware,
  applyHttpHostProtectionMiddleware,
  applyHttpOriginMiddleware,
} from "./httpSecurityMiddleware.ts";
import { rateLimitKeyFromIdentity, resolveRateLimitIdentity } from "./rateLimitIdentity.ts";
import { registerUrlElicitationRoutes } from "./urlElicitationRoutes.ts";

export type { HonoBindings, HonoEnv };

/** The part of the SDK handler the routes use. */
export type McpFetchHandler = Pick<McpHttpHandler, "fetch">;

export interface HonoAppSpec {
  /** Serves `/mcp`; builds a fresh `McpServer` per request. */
  handler: McpFetchHandler;
  config: AppConfig["http"];
  /** Backs the `/mcp-elicitation/*` browser routes for URL-mode elicitation. */
  kv: KvRuntime;
  /** Mounts the `/mcp-elicitation/*` routes. */
  urlElicitation?: boolean;
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
  // Apply timeout to all routes except /mcp (`subscriptions/listen` streams are long-lived)
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
          jsonrpc: "2.0",
          id: null,
          error: { code: RPC_ERROR_CODES.INVALID_REQUEST, message: "Request body too large" },
        }, HTTP_STATUS.CONTENT_TOO_LARGE);
      },
    }),
  );

  applyHttpOriginMiddleware(app, httpSecurityPolicy);
  applyHttpCorsMiddleware(app, config, httpSecurityPolicy);

  app.use(createHttpBearerAuthMiddleware(config.httpBearerToken));

  // After auth: clients without a known IP share one limit, which requests without a token must not use up.
  if (config.rateLimit.enabled) {
    const rl = config.rateLimit;
    app.use(
      // @ts-expect-error - rateLimiter does not preserve generic Hono env typing
      rateLimiter({
        windowMs: rl.windowMs,
        limit: (c) => {
          const identity = (c as unknown as Context<HonoEnv>).var.rateLimitIdentity;
          return identity.type === "unknown" ? rl.unknownClientLimit : rl.limit;
        },
        standardHeaders: "draft-7",
        keyGenerator: (c) =>
          rateLimitKeyFromIdentity((c as unknown as Context<HonoEnv>).var.rateLimitIdentity),
      }),
    );
  }

  return app;
}

function createRoutes(
  app: Hono<HonoEnv>,
  handler: McpFetchHandler,
  kv: KvRuntime,
  urlElicitation: boolean,
  notFoundHtml: string,
) {
  app.all("/mcp", (c) => handler.fetch(c.req.raw));

  if (urlElicitation) registerUrlElicitationRoutes(app, kv);

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
  { handler, config, kv, urlElicitation = false }: HonoAppSpec,
): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();
  const notFoundHtml = loadNotFoundPageHtml();
  configureMiddleware(app, config);
  createRoutes(app, handler, kv, urlElicitation, notFoundHtml);
  app.onError((err, c) => {
    console.error("Unhandled HTTP route error", err);
    const path = c.req.path;
    if (path === "/mcp") {
      return c.json({
        jsonrpc: "2.0",
        id: null,
        error: { code: RPC_ERROR_CODES.INTERNAL_ERROR, message: "Internal error" },
      }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    return c.text("Internal server error", HTTP_STATUS.INTERNAL_SERVER_ERROR);
  });
  return app;
}
