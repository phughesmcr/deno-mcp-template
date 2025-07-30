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
import { createRPCError } from "$/shared/utils.ts";
import type { HttpServerManager } from "./transport.ts";

/** Handles MCP request processing */
async function handleMCPRequest(transport: StreamableHTTPServerTransport, request: Request) {
  const { req, res } = toReqRes(request);
  await transport.handleRequest(req, res);
  const response = await toFetchResponse(res);
  return response;
}

/** Safely extracts the session ID from the request header */
function getSessionId(c: Context): string | undefined | Response {
  try {
    return c.req.header(HEADER_KEYS.SESSION_ID) ?? undefined;
  } catch {
    return c.json(
      createRPCError(INVALID_SESSION_ID, RPC_ERROR_CODES.INVALID_REQUEST, "Invalid session ID"),
      HTTP_STATUS.BAD_REQUEST,
    );
  }
}

/** Handles MCP errors and returns appropriate JSON-RPC error responses */
function handleInternalMCPError(c: Context): Response {
  let sessionId = getSessionId(c);
  if (sessionId instanceof Response) sessionId = INVALID_SESSION_ID;
  return c.json(
    createRPCError(
      sessionId ?? INVALID_SESSION_ID,
      RPC_ERROR_CODES.INTERNAL_ERROR,
      "Internal server error",
    ),
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
  );
}

/** Safely extracts the body text from the request */
async function getBodyText(c: Context): Promise<[Request, string] | Response> {
  try {
    const originalRequest = c.req.raw;
    const bodyText = await originalRequest.text();
    if (!bodyText.trim()) {
      return c.json(
        createRPCError(INVALID_SESSION_ID, RPC_ERROR_CODES.INVALID_REQUEST, "Invalid session ID"),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    return [originalRequest, bodyText];
  } catch {
    return c.json(
      createRPCError(INVALID_SESSION_ID, RPC_ERROR_CODES.INVALID_REQUEST, "Invalid session ID"),
      HTTP_STATUS.BAD_REQUEST,
    );
  }
}

/** Acquires a transport for the given session ID and body text */
async function acquireTransport(
  c: Context,
  sessionId: string | undefined,
  transportManager: HttpServerManager,
  bodyText: string,
): Promise<StreamableHTTPServerTransport | Response> {
  try {
    const { transports } = transportManager;
    const transport = await transports.acquire(sessionId, bodyText);
    return transport;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid JSON")) {
      return c.json(
        createRPCError(
          sessionId ?? INVALID_SESSION_ID,
          RPC_ERROR_CODES.INVALID_REQUEST,
          "Invalid JSON in request body",
        ),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    if (error instanceof Error && error.message.includes("No valid session")) {
      return c.json(
        createRPCError(
          sessionId ?? INVALID_SESSION_ID,
          RPC_ERROR_CODES.INVALID_REQUEST,
          "Invalid session ID",
        ),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    return c.json(
      createRPCError(
        sessionId ?? INVALID_SESSION_ID,
        RPC_ERROR_CODES.INTERNAL_ERROR,
        "Internal server error",
      ),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

/** Gets an existing transport for the given session ID */
async function getTransport(
  c: Context,
  sessionId: string,
  transportManager: HttpServerManager,
): Promise<StreamableHTTPServerTransport | Response> {
  try {
    const { transports } = transportManager;
    const transport = transports.get(sessionId);
    if (!transport) {
      return c.json(
        createRPCError(sessionId, RPC_ERROR_CODES.INVALID_REQUEST, "Invalid session ID"),
        HTTP_STATUS.BAD_REQUEST,
      );
    }
    return transport;
  } catch {
    return c.json(
      createRPCError(sessionId, RPC_ERROR_CODES.INTERNAL_ERROR, "Internal server error"),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

/** Connects the transport to the MCP server */
async function connectTransport(
  c: Context,
  mcp: McpServer,
  transport: StreamableHTTPServerTransport,
): Promise<void | Response> {
  try {
    await mcp.connect(transport);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Transport already started")) {
      // Transport is already connected, continue
    } else {
      return c.json(
        createRPCError(
          c.req.header(HEADER_KEYS.SESSION_ID) ?? INVALID_SESSION_ID,
          RPC_ERROR_CODES.INTERNAL_ERROR,
          "Internal server error",
        ),
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

/** Handles MCP requests for the POST method */
export function createPostHandler(mcp: McpServer, manager: HttpServerManager) {
  return async (c: Context) => {
    try {
      const sessionId = getSessionId(c);
      if (sessionId instanceof Response) return sessionId;

      const bodyResult = await getBodyText(c);
      if (bodyResult instanceof Response) return bodyResult;
      const [originalRequest, bodyText] = bodyResult;

      const transport = await acquireTransport(c, sessionId, manager, bodyText);
      if (transport instanceof Response) return transport;

      const connectResult = await connectTransport(c, mcp, transport);
      if (connectResult instanceof Response) return connectResult;

      return await handleMCPRequest(
        transport,
        new Request(originalRequest.url, {
          method: originalRequest.method,
          headers: originalRequest.headers,
          body: bodyText,
        }),
      );
    } catch {
      return handleInternalMCPError(c);
    }
  };
}

/** Handles MCP requests for the GET and DELETE methods */
export function createGetAndDeleteHandler(mcp: McpServer, manager: HttpServerManager) {
  return async (c: Context) => {
    try {
      const sessionId = getSessionId(c);
      if (sessionId instanceof Response) return sessionId;

      if (!sessionId) {
        return c.json(
          createRPCError(INVALID_SESSION_ID, RPC_ERROR_CODES.INVALID_REQUEST, "Invalid session ID"),
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const transport = await getTransport(c, sessionId, manager);
      if (transport instanceof Response) return transport;

      const connectResult = await connectTransport(c, mcp, transport);
      if (connectResult instanceof Response) return connectResult;

      return await handleMCPRequest(transport, c.req.raw);
    } catch {
      return handleInternalMCPError(c);
    }
  };
}
