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
  // remember to set your allowed hosts and origins in `../constants.ts`
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

  // Add middleware to set default Origin for MCP clients that don't send one
  app.use((req, _res, next) => {
    // TODO: is this secure?
    // If no Origin header is present, set it to a default allowed value
    if (!req.headers.origin) {
      req.headers.origin = `http://${config.hostname}:${config.port}`;
    }
    next();
  });

  // Setup CORS for MCP clients
  app.use(
    cors({
      origin: (
        origin: string,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (allowedOrigins.includes(origin) || allowedOrigins.includes("null")) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      exposedHeaders: [
        "Content-Type",
        "Authorization",
        "x-api-key",
        ...Object.values(HEADER_KEYS),
      ],
      allowedHeaders: [
        "Content-Type",
        "Accept",
        "Authorization",
        "x-api-key",
        ...Object.values(HEADER_KEYS),
      ],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      maxAge: 86400,
      credentials: true,
    }),
  );

  // Static Routes
  app.use("/.well-known", serveStatic(join(config.staticDir, ".well-known")));
  app.get("/llms.txt", (_, res) => res.redirect("/.well-known/llms.txt"));
  app.get("/openapi.yaml", (_, res) => res.redirect("/.well-known/openapi.yaml"));

  // MCP POST Route
  const handlePost = createMcpPostHandler(server, transports, { allowedHosts, allowedOrigins });
  app.post("/mcp", handlePost);

  // MCP Session GET and DELETE Routes for session management
  const handleSession = createMcpSessionHandler(transports);
  app.get("/mcp", handleSession);
  app.delete("/mcp", handleSession);

  // Root route
  const message = `${APP_NAME} running. See \`/llms.txt\` for machine-readable docs.`;
  app.get("/", (_req, res) => {
    res.status(HTTP_STATUS.SUCCESS).json(createRPCSuccess(0, { message }));
  });

  return { app, transports };
}

/**
 * Factory for MCP POST handler
 * @param server - The MCP server
 * @param transports - The transports to route the request to
 * @param config - The DNS rebinding protection configuration
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
      const sessionId = req.headers[HEADER_KEYS.SESSION_ID] as string | undefined;
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
          enableDnsRebindingProtection: true,
          allowedHosts: config.allowedHosts, // removable if enableDnsRebindingProtection is false
          allowedOrigins: config.allowedOrigins, // removable if enableDnsRebindingProtection is false
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        await server.connect(transport);
      } else {
        // Bad Request: No valid session ID provided
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createRPCError(
            req.body?.id || 0,
            RPC_ERROR_CODES.INVALID_REQUEST,
            "Bad Request: No valid session ID provided",
          ),
        );
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      // TODO: change to console.log and send valid RPC error
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createRPCError(
            req.body?.id || 0,
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
    const sessionId = req.headers[HEADER_KEYS.SESSION_ID];
    if (!sessionId || Array.isArray(sessionId)) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createRPCError(
          req.body?.id || 0,
          RPC_ERROR_CODES.INVALID_REQUEST,
          "Invalid session ID",
        ),
      );
      return;
    }
    const transport = transports[sessionId];
    if (!transport) {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createRPCError(
          req.body?.id || 0,
          RPC_ERROR_CODES.INTERNAL_ERROR,
          "No session transport found",
        ),
      );
      return;
    }
    await transport.handleRequest(req, res);
  };
}
