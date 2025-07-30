import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { serveStatic } from "hono/deno";

import { APP_NAME, HTTP_STATUS } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";
import { createGetHandler, createPostHandler } from "./handlers.ts";
import { configureMiddleware } from "./middleware.ts";
import { HttpServerManager } from "./transport.ts";

export function createHttpServer(mcp: McpServer, config: AppConfig): HttpServerManager {
  // Create HTTP server manager
  const transports = new HttpServerManager(config.http);

  // Create the Hono app
  const app = new Hono();

  // Configure all middleware
  configureMiddleware(app, config);

  // MCP POST route
  const postHandler = createPostHandler(mcp, transports);
  app.post("/mcp", postHandler);

  // MCP GET & DELETE routes
  const getHandler = createGetHandler(mcp, transports);
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

  // Error handler
  app.onError((err, c) => {
    return c.json(
      {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      },
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  });

  // Couple Deno.serve to the Hono HTTP server
  transports.fetch = app.fetch.bind(app);

  return transports;
}
