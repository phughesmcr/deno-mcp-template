import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import { Hono } from "hono";
import { serveStatic } from "hono/deno";

import { APP_NAME, HEADER_KEYS, HTTP_STATUS, RPC_ERROR_CODES } from "$/constants";
import type { AppConfig } from "$/types.ts";
import { createRPCError } from "$/utils.ts";
import type { Logger } from "../logger.ts";
import { HttpServerManager } from "./manager.ts";
import { configureMiddleware } from "./middleware.ts";

export function createHttpServer(
  mcp: Server,
  config: AppConfig,
  logger: Logger,
): HttpServerManager {
  const transports = new HttpServerManager(config, logger);

  const app = new Hono();

  // Configure all middleware
  configureMiddleware(app, config, logger);

  // MCP POST route
  app.post("/mcp", async (c) => {
    try {
      const sessionId = c.req.header(HEADER_KEYS.SESSION_ID);

      // Check if we have a valid initialize request before reading the body
      let transport = transports.get(sessionId);

      if (!transport) {
        // For new sessions, we need to check if this is an initialize request
        // Read the raw body first to avoid stream consumption issues
        const originalRequest = c.req.raw;
        const bodyText = await originalRequest.text();
        let jsonBody;

        try {
          jsonBody = JSON.parse(bodyText);
        } catch {
          return c.json(
            createRPCError(
              sessionId || 0,
              RPC_ERROR_CODES.INVALID_REQUEST,
              "Invalid JSON in request body",
            ),
            HTTP_STATUS.BAD_REQUEST,
          );
        }

        if (isInitializeRequest(jsonBody)) {
          transport = transports.create();
        } else {
          const msg = !sessionId ?
            "No valid session ID provided" :
            `No transport found for session ID: ${sessionId}`;
          return c.json(
            createRPCError(
              sessionId || 0,
              RPC_ERROR_CODES.INVALID_REQUEST,
              msg,
            ),
            HTTP_STATUS.BAD_REQUEST,
          );
        }

        await mcp.connect(transport);

        // Create a new request with the parsed body
        const newHeaders = new Headers(originalRequest.headers);
        newHeaders.set("Content-Type", "application/json");

        // Strip port from Host header if present
        const host = newHeaders.get("Host");
        if (host) {
          newHeaders.set("Host", host.split(":")[0]!);
        }

        // Ensure Origin header is set for DNS rebinding protection
        if (!newHeaders.get("Origin")) {
          try {
            const requestUrl = new URL(originalRequest.url);
            newHeaders.set("Origin", requestUrl.origin);
          } catch {
            // If we can't parse the URL, don't set a default Origin
            // The MCP transport will handle the missing Origin header
          }
        }

        const newRequest = new Request(originalRequest.url, {
          method: originalRequest.method,
          headers: newHeaders,
          body: bodyText, // Use the original body text
        });

        const { req, res } = toReqRes(newRequest);
        await transport.handleRequest(req, res);
        return toFetchResponse(res);
      } else {
        // For existing sessions, read the body safely to avoid stream consumption issues
        const originalRequest = c.req.raw;
        const bodyText = await originalRequest.text();
        const newHeaders = new Headers(originalRequest.headers);

        // Strip port from Host header if present
        const host = newHeaders.get("Host");
        if (host) {
          newHeaders.set("Host", host.split(":")[0]!);
        }

        // Ensure Origin header is set for DNS rebinding protection
        if (!newHeaders.get("Origin")) {
          try {
            const requestUrl = new URL(originalRequest.url);
            newHeaders.set("Origin", requestUrl.origin);
          } catch {
            // If we can't parse the URL, don't set a default Origin
            // The MCP transport will handle the missing Origin header
          }
        }

        const freshRequest = new Request(originalRequest.url, {
          method: originalRequest.method,
          headers: newHeaders,
          body: bodyText,
        });

        const { req, res } = toReqRes(freshRequest);
        await transport.handleRequest(req, res);
        return toFetchResponse(res);
      }
    } catch (error) {
      logger.error({
        data: {
          error: "MCP HTTP handler error:",
          details: error,
        },
      });
      return c.json(
        createRPCError(
          0,
          RPC_ERROR_CODES.INTERNAL_ERROR,
          `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
        ),
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }
  });

  // MCP GET & DELETE routes
  app.on(["GET", "DELETE"], "/mcp", async (c) => {
    try {
      const sessionId = c.req.header(HEADER_KEYS.SESSION_ID);
      if (!sessionId) {
        return c.json(
          createRPCError(0, RPC_ERROR_CODES.INVALID_REQUEST, "Invalid session ID"),
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const transport = transports.get(sessionId);
      if (!transport) {
        return c.json(
          createRPCError(
            sessionId || 0,
            RPC_ERROR_CODES.INTERNAL_ERROR,
            "Session not found or expired",
          ),
          HTTP_STATUS.NOT_FOUND,
        );
      }

      // GET and DELETE requests typically don't have a body, create fresh request with proper headers
      const originalRequest = c.req.raw;
      const newHeaders = new Headers(originalRequest.headers);

      // Strip port from Host header if present
      const host = newHeaders.get("Host");
      if (host) {
        newHeaders.set("Host", host.split(":")[0]!);
      }

      // Ensure Origin header is set for DNS rebinding protection
      if (!newHeaders.get("Origin")) {
        try {
          const requestUrl = new URL(originalRequest.url);
          newHeaders.set("Origin", requestUrl.origin);
        } catch {
          // If we can't parse the URL, don't set a default Origin
          // The MCP transport will handle the missing Origin header
        }
      }

      const freshRequest = new Request(originalRequest.url, {
        method: originalRequest.method,
        headers: newHeaders,
      });

      const { req, res } = toReqRes(freshRequest);
      await transport.handleRequest(req, res);
      return toFetchResponse(res);
    } catch (error) {
      logger.error({
        data: {
          error: "MCP HTTP GET/DELETE handler error:",
          details: error,
        },
      });
      return c.json(
        createRPCError(
          0,
          RPC_ERROR_CODES.INTERNAL_ERROR,
          `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
        ),
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }
  });

  // Static Routes
  app.use("/static/*", serveStatic({ root: "./static" }));
  app.use("/.well-known/*", serveStatic({ root: "./static/.well-known" }));
  app.use("/favicon.ico", serveStatic({ path: "./static/favicon.ico" }));
  app.get("/llms.txt", (c) => c.redirect("/.well-known/llms.txt"));
  app.get("/openapi.yaml", (c) => c.redirect("/.well-known/openapi.yaml"));
  app.get("/", (c) => c.text(`${APP_NAME} running. See \`/llms.txt\` for machine-readable docs.`));

  // Fallback Route - serve llms.txt for any unmatched routes
  app.get("*", serveStatic({ path: "./static/.well-known/llms.txt" }));

  // Couple Deno.serve to the Hono HTTP server
  transports.setFetch(app.fetch.bind(app));

  return transports;
}
