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
  app.use(helmet());
  app.use(express.json());

  // Setup allowed hosts and origins for DNS rebinding protection
  // remember to set your allowed hosts and origins in `../constants.ts`
  const url = new URL(import.meta.url);
  const metaUrl = url.protocol.match(/^https?/) ? url : null;
  const allowedHosts = [
    ...new Set([
      ...ALLOWED_HOSTS,
      config.hostname,
      `${config.hostname}:${config.port}`,
      ...(metaUrl?.hostname ? [metaUrl.hostname] : []),
    ]),
  ];
  const allowedOrigins = [
    ...new Set([
      ...ALLOWED_ORIGINS,
      config.hostname,
      `http://${config.hostname}:${config.port}`,
      `https://${config.hostname}:${config.port}`,
      ...(metaUrl?.origin ? [metaUrl.origin] : []),
    ]),
  ];

  // Middleware to handle missing Origin headers for DNS rebinding protection
  // ⚠️ You may not want this in production
  app.use((req, _res, next) => {
    if (!req.headers.origin) {
      // Set a default origin for requests without one (e.g., non-browser clients)
      req.headers.origin = `http://${config.hostname}:${config.port}`;
    }
    next();
  });

  // Setup CORS for MCP clients
  app.use(
    cors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        // Handle requests without Origin header (e.g., same-origin requests, some tools)
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS policy`));
        }
      },
      exposedHeaders: [
        ...EXPOSED_HEADERS,
        ...Object.values(HEADER_KEYS),
      ],
      allowedHeaders: [
        ...ALLOWED_HEADERS,
        ...Object.values(HEADER_KEYS),
      ],
      allowMethods: ALLOWED_METHODS,
      maxAge: 86400,
      credentials: true,
    }),
  );

  // Static Routes
  app.use("/.well-known", serveStatic(join(config.staticDir, ".well-known")));
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
