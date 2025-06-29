/**
 * @description Express server setup for MCP over HTTP transport
 * @module
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { join } from "@std/path";
import cors from "cors";
import express, { type Request, type Response } from "express";
import serveStatic from "serve-static";

import {
  ALLOWED_HOSTS,
  ALLOWED_ORIGINS,
  APP_NAME,
  HEADER_KEYS,
  HTTP_STATUS,
  RPC_ERROR_CODES,
} from "../constants.ts";
import type { ExpressConfig, ExpressResult, RequestHandler, TransportRecord } from "../types.ts";
import { createRPCError, createRPCSuccess } from "../utils.ts";
import { InMemoryEventStore } from "./inMemoryEventStore.ts";

/**
 * Creates an Express server for MCP over HTTP/SSE transport
 * @param config - The configuration for the Express server
 * @param server - The MCP server
 * @returns The Express server and transports
 */
export function createExpressServer(
  config: ExpressConfig,
  server: Server,
): ExpressResult {
  const transports: TransportRecord = {};
  const app = express();
  app.use(express.json());

  // Setup allowed hosts and origins for DNS rebinding protection
  // remember to set your allowed hosts and origins in `constants.ts`
  const url = new URL(import.meta.url);
  const metaUrl = url.protocol.match(/^https?/) ? url : null;

  const allowedHosts = [
    ...new Set([
      ...ALLOWED_HOSTS,
      config.hostname,
      ...(metaUrl?.hostname ? [metaUrl.hostname] : []),
    ]),
  ];

  const allowedOrigins = [
    ...new Set([
      ...ALLOWED_ORIGINS,
      config.hostname,
      ...(metaUrl?.origin ? [metaUrl.origin] : []),
    ]),
  ];

  // Setup CORS
  app.use(
    cors({
      origin: allowedOrigins,
      exposedHeaders: Object.values(HEADER_KEYS),
      allowedHeaders: ["Content-Type", ...Object.values(HEADER_KEYS)],
    }),
  );

  // Static Routes
  app.use("/.well-known", serveStatic(join(config.staticDir, ".well-known")));
  app.get("/llms.txt", (_, res) => res.redirect("/.well-known/llms.txt"));
  app.get("/openapi.yaml", (_, res) => res.redirect("/.well-known/openapi.yaml"));

  // MCP POST Route
  app.post(
    "/mcp",
    createMcpPostHandler(server, transports, { allowedHosts, allowedOrigins }),
  );

  // MCP Session GET and DELETE Routes for session management
  const mcpSessionHandler = createMcpSessionHandler(transports);
  app.get("/mcp", mcpSessionHandler);
  app.delete("/mcp", mcpSessionHandler);

  // Root route
  app.get("/", (_req, res) => {
    const message = `${APP_NAME} running. See \`/llms.txt\` for machine-readable docs.`;
    res.status(HTTP_STATUS.SUCCESS).json(createRPCSuccess(0, { message }));
  });

  return { app, transports };
}

/**
 * Factory for MCP POST handler
 * @param server - The MCP server
 * @param transports - The transports to route the request to
 * @returns The handler function
 */
function createMcpPostHandler(
  server: Server,
  transports: TransportRecord,
  config: { allowedHosts: string[]; allowedOrigins: string[] },
): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      // Check for existing session ID
      const sessionId = req.headers[HEADER_KEYS.SESSION_ID] as
        | string
        | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (isInitializeRequest(req.body)) {
        // New initialization request
        const newSessionId = crypto.randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (actualSessionId) => transports[actualSessionId] = transport,
          enableJsonResponse: true,
          eventStore: new InMemoryEventStore(),
          // @ts-expect-error - Property exists in runtime but not in type definitions
          enableDnsRebindingProtection: true,
          allowedHosts: config.allowedHosts, // remove if enableDnsRebindingProtection is false
          allowedOrigins: config.allowedOrigins, // remove if enableDnsRebindingProtection is false
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        await server.connect(transport);
      } else {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createRPCError(
            req.body.id,
            RPC_ERROR_CODES.INVALID_REQUEST,
            "Bad Request: No valid session ID provided",
          ),
        );
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createRPCError(
            req.body.id,
            RPC_ERROR_CODES.INTERNAL_ERROR,
            "Internal server error",
          ),
        );
      }
    }
  };
}

/**
 * Factory for MCP Session GET and DELETE handlers
 * @param transports - The transports to route the request to
 * @returns The handler function
 */
function createMcpSessionHandler(transports: TransportRecord): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.headers[HEADER_KEYS.SESSION_ID] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(HTTP_STATUS.BAD_REQUEST).send("Invalid or missing session ID");
      return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };
}
