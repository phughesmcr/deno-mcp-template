import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";

import {
  HEADER_KEYS,
  HTTP_STATUS,
  INVALID_SESSION_ID,
  RPC_ERROR_CODES,
} from "$/shared/constants.ts";
import { RPCError } from "$/shared/utils.ts";
import { isUUID } from "$/shared/validation.ts";
import type { HTTPTransportManager } from "./transport.ts";

/** Handles MCP errors and returns appropriate JSON-RPC error responses */
function handleMCPError(c: Context, error?: unknown): Response {
  const sessionId = c.req.header(HEADER_KEYS.SESSION_ID) ?? INVALID_SESSION_ID;

  let rpcError: RPCError;
  if (error instanceof RPCError) {
    rpcError = error;
  } else if (error instanceof Error) {
    rpcError = RPCError.fromError(
      error,
      RPC_ERROR_CODES.INTERNAL_ERROR,
      sessionId,
    );
  } else {
    rpcError = RPCError.internalError(sessionId);
  }

  // Map RPC error codes to HTTP status and return
  const payload = rpcError.toJSONRPC();
  switch (rpcError.code) {
    case RPC_ERROR_CODES.PARSE_ERROR:
    case RPC_ERROR_CODES.INVALID_REQUEST:
    case RPC_ERROR_CODES.INVALID_PARAMS:
      return c.json(payload, HTTP_STATUS.BAD_REQUEST);
    case RPC_ERROR_CODES.METHOD_NOT_FOUND:
      return c.json(payload, HTTP_STATUS.METHOD_NOT_ALLOWED);
    default:
      return c.json(payload, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/** Passes the request to the transport and returns the response */
async function handleMCPRequest(
  transport: WebStandardStreamableHTTPServerTransport,
  request: Request,
  parsedBody?: unknown,
): Promise<Response> {
  return await transport.handleRequest(request, { parsedBody });
}

/** Extracts and validates the session ID from the request header */
function getSessionId(c: Context): string | undefined {
  const sessionId = c.req.header(HEADER_KEYS.SESSION_ID);
  if (!sessionId?.trim()) return undefined;
  if (isUUID(sessionId)) return sessionId;
  throw new RPCError({
    code: RPC_ERROR_CODES.INVALID_REQUEST,
    message: "Invalid session ID",
    requestId: INVALID_SESSION_ID,
  });
}

/** Safely attempts to connect the transport to the MCP server */
async function connectTransport(
  mcp: McpServer,
  transport: WebStandardStreamableHTTPServerTransport,
): Promise<void> {
  try {
    await mcp.connect(transport);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Transport already started")) {
      // Transport is already connected, continue
      return;
    }
    throw error;
  }
}

/**
 * Creates a handler for MCP POST requests
 * @param mcp - The MCP server instance
 * @param transports - The HTTP transport manager
 * @returns The POST request handler
 */
export function createPostHandler(
  mcp: McpServer,
  transports: HTTPTransportManager,
): (c: Context) => Promise<Response> {
  return async (c: Context) => {
    try {
      const sessionId = getSessionId(c);
      const originalRequest = c.req.raw.clone();
      const bodyText = await c.req.raw.text();
      if (!bodyText.length) {
        throw new RPCError({
          code: RPC_ERROR_CODES.INVALID_REQUEST,
          message: "Empty request body",
          requestId: sessionId ?? INVALID_SESSION_ID,
        });
      }
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(bodyText);
      } catch (error) {
        throw new RPCError({
          code: RPC_ERROR_CODES.PARSE_ERROR,
          message: error instanceof Error ? error.message : "Invalid JSON in request body",
          requestId: sessionId ?? INVALID_SESSION_ID,
        });
      }
      const transport = await transports.acquire(bodyText, sessionId);
      await connectTransport(mcp, transport);
      return await handleMCPRequest(transport, originalRequest, parsedBody);
    } catch (error) {
      return handleMCPError(c, error);
    }
  };
}

/**
 * Creates a handler for MCP GET and DELETE requests
 * @param mcp - The MCP server instance
 * @param transports - The HTTP transport manager
 * @returns The GET and DELETE request handler
 */
export function createGetAndDeleteHandler(
  mcp: McpServer,
  transports: HTTPTransportManager,
): (c: Context) => Promise<Response> {
  return async (c: Context) => {
    try {
      const sessionId = getSessionId(c);
      if (!sessionId) {
        return handleMCPError(
          c,
          new RPCError({
            code: RPC_ERROR_CODES.INVALID_REQUEST,
            message: "Session ID is required",
            requestId: INVALID_SESSION_ID,
          }),
        );
      }
      const transport = transports.get(sessionId);
      if (!transport) {
        return handleMCPError(
          c,
          new RPCError({
            code: RPC_ERROR_CODES.INVALID_REQUEST,
            message: "No transport found for session ID",
            requestId: sessionId,
          }),
        );
      }
      await connectTransport(mcp, transport);
      return await handleMCPRequest(transport, c.req.raw);
    } catch (error) {
      return handleMCPError(c, error);
    }
  };
}
