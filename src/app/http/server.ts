import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { serveStatic } from "hono/deno";

import { APP_NAME, HTTP_STATUS } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";
import { createGetAndDeleteHandler, createPostHandler } from "./handlers.ts";
import { configureMiddleware } from "./middleware.ts";
import { HttpServerManager } from "./transport.ts";

export interface HttpServer {
  /** Starts the HTTP server */
  connect: () => Promise<void>;
  /** Stops the HTTP server */
  disconnect: () => Promise<void>;
}

function createRoutes(app: Hono, mcp: McpServer, transports: HttpServerManager) {
  // MCP POST route
  const postHandler = createPostHandler(mcp, transports);
  app.post("/mcp", postHandler);

  // MCP GET & DELETE routes
  const getHandler = createGetAndDeleteHandler(mcp, transports);
  app.on(["GET", "DELETE"], "/mcp", getHandler);

  // Static Routes
  app.use("/static/*", serveStatic({ root: "./static" }));
  app.use("/.well-known/*", serveStatic({ root: "./static/.well-known" }));
  app.use("/favicon.ico", serveStatic({ path: "./static/favicon.ico" }));
  app.get("/llms.txt", (c) => c.redirect("/.well-known/llms.txt"));
  app.get("/openapi.yaml", (c) => c.redirect("/.well-known/openapi.yaml"));
  app.get("/", (c) => c.text(`${APP_NAME} running. See \`/llms.txt\` for machine-readable docs.`));

  // 404 Route
  app.get("*", serveStatic({ path: "./static/404.html" }));
}

function createApp(
  mcp: McpServer,
  config: AppConfig["http"],
  transports: HttpServerManager,
): Hono {
  const app = new Hono();
  configureMiddleware(app, config);
  createRoutes(app, mcp, transports);
  app.onError((err, c) => {
    return c.json(
      {
        content: [{ type: "text", text: err.message }],
        isError: true,
      },
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  });
  return app;
}

export function createHttpServer(mcp: McpServer, config: AppConfig["http"]): HttpServer {
  const transports = new HttpServerManager(config);
  const app = createApp(mcp, config, transports);
  transports.fetch = app.fetch.bind(app); // Couple Deno.serve to the Hono HTTP server
  return {
    connect: async () => {
      if (transports.enabled) {
        try {
          await transports.start();
        } catch (error) {
          console.error(`${APP_NAME} failed to start HTTP server: ${error}`);
        }
      }
    },
    disconnect: async () => {
      if (transports.enabled) {
        try {
          await transports.stop();
        } catch (error) {
          console.error(`${APP_NAME} failed to stop HTTP server: ${error}`);
        }
      }
    },
  };
}
