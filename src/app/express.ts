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
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import serveStatic from "serve-static";

import {
  ALLOWED_HEADERS,
  ALLOWED_HOSTS,
  ALLOWED_METHODS,
  ALLOWED_ORIGINS,
  APP_NAME,
  EXPOSED_HEADERS,
  HEADER_KEYS,
  HTTP_STATUS,
  RPC_ERROR_CODES,
} from "../constants.ts";
import type {
  AppConfig,
  ExpressResult,
  LogLevelKey,
  RequestHandler,
  TransportRecord,
} from "../types.ts";
import { createCallToolErrorResponse, createRPCError, createRPCSuccess } from "../utils.ts";
import { InMemoryEventStore } from "./inMemoryEventStore.ts";

/**
 * Creates an Express server for MCP over HTTP/SSE transport
 * @param config - The configuration for the Express server
 * @param server - The MCP server
 * @returns The Express server and transports
 */
export function createExpressServer(
  config: AppConfig,
  server: Server,
): ExpressResult {
  const transports: TransportRecord = {};
  const app = express();
  app.use(express.json());

  // Setup helmet and rate limiting
  app.use(helmet());
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: "draft-8", // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    // store: ... , // ⚠️ use Redis, Memcached, etc. in production.
  }));

  // Setup allowed hosts and origins for DNS rebinding protection
  const allowedHosts = [...new Set([...ALLOWED_HOSTS])];
  const allowedOrigins = [...new Set([...ALLOWED_ORIGINS])];

  // Setup CORS for MCP clients
  app.use(
    cors({
      allowOrigin: "*",
      allowMethods: ALLOWED_METHODS,
      credentials: true,
      exposedHeaders: [
        ...EXPOSED_HEADERS,
        ...Object.values(HEADER_KEYS),
      ],
      allowedHeaders: [
        ...ALLOWED_HEADERS,
        ...Object.values(HEADER_KEYS),
      ],
      maxAge: 86400,
    }),
  );

  // Static Routes
  app.use("/.well-known", serveStatic(join("./static", ".well-known")));
  app.get("/llms.txt", (_, res) => res.redirect("/.well-known/llms.txt"));
  app.get("/openapi.yaml", (_, res) => res.redirect("/.well-known/openapi.yaml"));

  // MCP POST Route
  const handlePost = createMcpPostHandler(server, transports, {
    allowedHosts,
    allowedOrigins,
    log: config.log,
  });
  app.post("/mcp", handlePost);

  // MCP Session GET and DELETE Routes for session management
  const handleSession = createMcpSessionHandler(transports, { log: config.log });
  app.get("/mcp", handleSession);
  app.delete("/mcp", handleSession);

  // Root route
  const message = `${APP_NAME} running. See \`/llms.txt\` for machine-readable docs.`;
  app.get("/", (_req, res) => {
    res.status(HTTP_STATUS.SUCCESS).json(createRPCSuccess(0, { message }));
  });

  return { app, transports, allowedHosts, allowedOrigins };
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
  config: { allowedHosts: string[]; allowedOrigins: string[]; log: LogLevelKey },
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
        const rpcError = createRPCError(
          req.body?.id || 0,
          RPC_ERROR_CODES.INVALID_REQUEST,
          "Bad Request: No valid session ID provided",
        );
        if (config.log === "debug") {
          console.error(createCallToolErrorResponse(rpcError), rpcError);
        }
        res.status(HTTP_STATUS.BAD_REQUEST).json(rpcError);
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      const rpcError = createRPCError(
        req.body?.id || 0,
        RPC_ERROR_CODES.INTERNAL_ERROR,
        "Internal server error",
        error instanceof Error ? error : "Unknown error",
      );
      if (config.log === "debug") {
        console.error(createCallToolErrorResponse(rpcError), rpcError);
      }
      if (!res.headersSent) {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(rpcError);
      }
    }
  };
}

/**
 * Factory for MCP Session GET and DELETE handlers
 * @param transports - The transports to route the request to
 * @returns The handler function
 */
function createMcpSessionHandler(
  transports: TransportRecord,
  config: { log: LogLevelKey },
): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.headers[HEADER_KEYS.SESSION_ID];
    if (!sessionId || Array.isArray(sessionId)) {
      const rpcError = createRPCError(
        req.body?.id || 0,
        RPC_ERROR_CODES.INVALID_REQUEST,
        "Invalid session ID",
      );
      if (config.log === "debug") {
        console.error(createCallToolErrorResponse(rpcError), rpcError);
      }
      res.status(HTTP_STATUS.BAD_REQUEST).json(rpcError);
      return;
    }
    const transport = transports[sessionId];
    if (!transport) {
      const rpcError = createRPCError(
        req.body?.id || 0,
        RPC_ERROR_CODES.INTERNAL_ERROR,
        "No session transport found",
      );
      if (config.log === "debug") {
        console.error(createCallToolErrorResponse(rpcError), rpcError);
      }
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(rpcError);
      return;
    }
    await transport.handleRequest(req, res);
  };
}
