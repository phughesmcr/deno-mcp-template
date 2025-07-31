import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { toFetchResponse, toReqRes } from "fetch-to-node";
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
      sessionId ?? INVALID_SESSION_ID,
    );
  } else {
    rpcError = RPCError.internalError(sessionId ?? INVALID_SESSION_ID);
  }

  return c.json(rpcError.toJSONRPC(), HTTP_STATUS.INTERNAL_SERVER_ERROR);
}

/** Passes the request to the transport and returns the response */
async function handleMCPRequest(
  transport: StreamableHTTPServerTransport,
  request: Request,
): Promise<Response> {
  const { req, res } = toReqRes(request);
  await transport.handleRequest(req, res);
  const response = await toFetchResponse(res);
  return response;
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
  transport: StreamableHTTPServerTransport,
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
      const transport = await transports.acquire(bodyText, sessionId);
      await connectTransport(mcp, transport);
      return await handleMCPRequest(transport, originalRequest);
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
