import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Context } from "hono";

import type { Logger } from "$/app/logger.ts";
import { HEADER_KEYS, HTTP_STATUS, RPC_ERROR_CODES } from "$/shared/constants.ts";
import { createRPCError } from "$/shared/utils.ts";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import type { HttpServerManager } from "./transport.ts";

/** Handles MCP request processing */
async function handleMCPRequest(
  transport: StreamableHTTPServerTransport,
  originalRequest: Request,
): Promise<Response> {
  try {
    if (!originalRequest) {
      throw new Error("Invalid request: request is null or undefined");
    }

    const { req, res } = toReqRes(originalRequest);

    if (!req || !res) {
      throw new Error("Failed to convert Request to Node.js req/res");
    }

    await transport.handleRequest(req, res);
    const response = toFetchResponse(res);

    if (!response) {
      throw new Error("Failed to convert Node.js response to fetch Response");
    }

    return response;
  } catch (error) {
    throw error;
  }
}

/** Handles MCP errors and returns appropriate JSON-RPC error responses */
function handleMCPError(sessionId: string | undefined): Response {
  return new Response(
    JSON.stringify(
      createRPCError(
        sessionId || 0,
        RPC_ERROR_CODES.INTERNAL_ERROR,
        "Internal server error",
      ),
    ),
    {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function createPostHandler(mcp: Server, manager: HttpServerManager, logger: Logger) {
  const { transports } = manager;
  return async (c: Context) => {
    try {
      const sessionId = c.req.header(HEADER_KEYS.SESSION_ID);
      const originalRequest = c.req.raw;
      const bodyText = await originalRequest.text();

      if (!bodyText.trim()) {
        return c.json(
          createRPCError(
            sessionId || 0,
            RPC_ERROR_CODES.INVALID_REQUEST,
            "Empty request body",
          ),
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const transport = transports.acquire(sessionId, bodyText);
      try {
        await mcp.connect(transport);
      } catch (error) {
        if (error instanceof Error && error.message.includes("Transport already started")) {
          // Transport is already connected, continue
        } else {
          throw error;
        }
      }
      // Create a new request with the body text to avoid ReadableStream lock
      const newRequest = new Request(originalRequest.url, {
        method: originalRequest.method,
        headers: originalRequest.headers,
        body: bodyText,
      });
      return await handleMCPRequest(transport, newRequest);
    } catch (error) {
      logger.error({
        data: {
          error: "Error in POST handler",
          details: error,
        },
      });

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

      if (error instanceof Error && error.message.includes("Empty request body")) {
        return c.json(
          createRPCError(
            c.req.header(HEADER_KEYS.SESSION_ID) || 0,
            RPC_ERROR_CODES.INVALID_REQUEST,
            error.message,
          ),
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      return handleMCPError(c.req.header(HEADER_KEYS.SESSION_ID));
    }
  };
}

export function createGetHandler(mcp: Server, manager: HttpServerManager, logger: Logger) {
  const { transports } = manager;
  return async (c: Context) => {
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
      try {
        await mcp.connect(transport);
      } catch (error) {
        if (error instanceof Error && error.message.includes("Transport already started")) {
          // Transport is already connected, continue
        } else {
          throw error;
        }
      }
      return await handleMCPRequest(transport, c.req.raw);
    } catch (error) {
      logger.error({
        data: {
          error: "Error in GET handler",
          details: error,
        },
      });
      return handleMCPError(c.req.header(HEADER_KEYS.SESSION_ID));
    }
  };
}
