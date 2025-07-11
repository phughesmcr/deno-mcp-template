import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

/**
 * Prepares headers for MCP transport by stripping port from Host header
 * and ensuring Origin header is set for DNS rebinding protection
 */
function prepareHeaders(originalRequest: Request): Headers {
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

  return newHeaders;
}

/**
 * Creates a new Request object with prepared headers and consistent content type
 */
function createMCPRequest(originalRequest: Request, bodyText?: string): Request {
  const newHeaders = prepareHeaders(originalRequest);
  newHeaders.set("Content-Type", "application/json");

  return new Request(originalRequest.url, {
    method: originalRequest.method,
    headers: newHeaders,
    body: bodyText,
  });
}

/**
 * Handles MCP request processing
 */
async function handleMCPRequest(
  transport: StreamableHTTPServerTransport,
  originalRequest: Request,
  bodyText?: string,
): Promise<Response> {
  const mcpRequest = createMCPRequest(originalRequest, bodyText);
  const { req, res } = toReqRes(mcpRequest);
  await transport.handleRequest(req, res);
  return toFetchResponse(res);
}

/**
 * Handles errors and returns appropriate JSON-RPC error responses
 */
function handleMCPError(
  error: unknown,
  sessionId: string | undefined,
  logger: Logger,
  context: string,
): Response {
  logger.error({
    data: {
      error: `MCP ${context} error:`,
      details: error,
    },
  });

  const errorMessage = error instanceof Error ? error.message : String(error);
  const rpcError = createRPCError(
    sessionId || 0,
    RPC_ERROR_CODES.INTERNAL_ERROR,
    `Internal server error: ${errorMessage}`,
  );

  return new Response(JSON.stringify(rpcError), {
    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Handles session creation for new MCP connections
 * Uses a Map to track pending sessions to prevent race conditions
 */
class SessionManager {
  private pendingSessions = new Map<string, Promise<StreamableHTTPServerTransport>>();

  async getOrCreateSession(
    sessionId: string | undefined,
    transports: HttpServerManager,
    mcp: Server,
    requestBody: string,
  ): Promise<{ transport: StreamableHTTPServerTransport; sessionId: string }> {
    const existingTransport = transports.get(sessionId);
    if (existingTransport) {
      return { transport: existingTransport, sessionId: sessionId! };
    }

    // Parse request body to check if it's an initialize request
    let jsonBody;
    try {
      jsonBody = JSON.parse(requestBody);
    } catch {
      throw new Error("Invalid JSON in request body");
    }

    if (!isInitializeRequest(jsonBody)) {
      const msg = !sessionId ?
        "No valid session ID provided" :
        `No transport found for session ID: ${sessionId}`;
      throw new Error(msg);
    }

    // Use a unique key for session creation to prevent race conditions
    const sessionKey = sessionId || `new_session_${Date.now()}_${Math.random()}`;

    // Check if we're already creating this session
    if (this.pendingSessions.has(sessionKey)) {
      const transport = await this.pendingSessions.get(sessionKey)!;
      return { transport, sessionId: sessionKey };
    }

    // Create new session
    const sessionPromise = this.createNewSession(transports, mcp);
    this.pendingSessions.set(sessionKey, sessionPromise);

    try {
      const transport = await sessionPromise;
      const result = { transport, sessionId: sessionKey };
      this.pendingSessions.delete(sessionKey);
      return result;
    } catch (error) {
      this.pendingSessions.delete(sessionKey);
      throw error;
    }
  }

  private async createNewSession(
    transports: HttpServerManager,
    mcp: Server,
  ): Promise<StreamableHTTPServerTransport> {
    const transport = transports.create();
    await mcp.connect(transport);
    return transport;
  }
}

export function createHttpServer(
  mcp: Server,
  config: AppConfig,
  logger: Logger,
): HttpServerManager {
  const transports = new HttpServerManager(config, logger);
  const sessionManager = new SessionManager();

  const app = new Hono();

  // Configure all middleware
  configureMiddleware(app, config, logger);

  // MCP POST route
  app.post("/mcp", async (c) => {
    try {
      const sessionId = c.req.header(HEADER_KEYS.SESSION_ID);
      const originalRequest = c.req.raw;
      const bodyText = await originalRequest.text();

      const { transport } = await sessionManager.getOrCreateSession(
        sessionId,
        transports,
        mcp,
        bodyText,
      );

      return await handleMCPRequest(transport, originalRequest, bodyText);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Invalid JSON")) {
        return c.json(
          createRPCError(
            c.req.header(HEADER_KEYS.SESSION_ID) || 0,
            RPC_ERROR_CODES.INVALID_REQUEST,
            "Invalid JSON in request body",
          ),
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      if (
        error instanceof Error &&
        (error.message.includes("No valid session") || error.message.includes("No transport found"))
      ) {
        return c.json(
          createRPCError(
            c.req.header(HEADER_KEYS.SESSION_ID) || 0,
            RPC_ERROR_CODES.INVALID_REQUEST,
            error.message,
          ),
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      return handleMCPError(error, c.req.header(HEADER_KEYS.SESSION_ID), logger, "POST handler");
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
            sessionId,
            RPC_ERROR_CODES.INTERNAL_ERROR,
            "Session not found or expired",
          ),
          HTTP_STATUS.NOT_FOUND,
        );
      }

      return await handleMCPRequest(transport, c.req.raw);
    } catch (error) {
      return handleMCPError(
        error,
        c.req.header(HEADER_KEYS.SESSION_ID),
        logger,
        "GET/DELETE handler",
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
