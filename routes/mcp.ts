import { MCP_SERVER_NAME, SESSION_ID_HEADER } from "../src/constants.ts";
import { createJsonResponse, createSuccessResponse } from "../src/utils.ts";
import {
  INVALID_REQUEST,
  JSONRPC_VERSION,
  type JSONRPCMessage,
  type JSONRPCRequest,
  LATEST_PROTOCOL_VERSION,
  PARSE_ERROR,
} from "../vendor/schema.ts";
import type { Server } from "@modelcontextprotocol/sdk/server";

/**
 * Handles POST requests to the MCP endpoint
 * Processes JSON-RPC messages from the client
 */
export async function POST(req: Request, server: Server) {
  try {
    // Validate content type
    const contentType = req.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return createJsonResponse(
        { error: "Content-Type must be application/json" },
        415,
      );
    }

    // Check Accept header
    const acceptHeader = req.headers.get("accept");
    if (
      !acceptHeader ||
      !(acceptHeader.includes("application/json") || acceptHeader.includes("text/event-stream"))
    ) {
      return createJsonResponse(
        { error: "Accept header must include application/json or text/event-stream" },
        406,
      );
    }

    // Extract session ID if present
    const sessionId = req.headers.get(SESSION_ID_HEADER);

    // Parse the request body
    const body = await req.json() as JSONRPCMessage;

    // Handle different message types
    if (Array.isArray(body)) {
      // Handle batch requests/notifications
      const containsRequests = body.some((msg) => "id" in msg && "method" in msg);

      if (!containsRequests) {
        // Only notifications or responses, return 202 Accepted
        return new Response(null, { status: 202 });
      } else {
        // Contains requests, process and return responses
        // For simplicity, we're returning a placeholder response for batched requests
        return createJsonResponse(
          { jsonrpc: JSONRPC_VERSION, id: "batch", result: {} },
          200,
          {
            ...(sessionId && { SESSION_ID_HEADER: sessionId }),
          },
        );
      }
    } else if ("id" in body && "method" in body) {
      // Single request
      const request = body as JSONRPCRequest;

      // Handle initialization specially to assign session ID
      if (request.method === "initialize") {
        const newSessionId = sessionId || crypto.randomUUID();

        const result = createSuccessResponse(request.id, {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          serverInfo: {
            name: MCP_SERVER_NAME,
            version: server.getClientVersion(),
          },
          capabilities: server.getClientCapabilities(),
        });

        result.headers.set(SESSION_ID_HEADER, newSessionId);

        return result;
      }

      const result = createSuccessResponse(request.id, {});
      result.headers.set(SESSION_ID_HEADER, sessionId || "");
      return result;
    } else if ("method" in body && !("id" in body)) {
      // Single notification
      return new Response(null, {
        status: 202,
        headers: {
          ...(sessionId && { SESSION_ID_HEADER: sessionId }),
        },
      });
    } else if ("id" in body && "result" in body) {
      // Single response
      return new Response(null, {
        status: 202,
        headers: {
          ...(sessionId && { SESSION_ID_HEADER: sessionId }),
        },
      });
    } else {
      // Invalid message
      const result = createJsonResponse(
        {
          jsonrpc: JSONRPC_VERSION,
          error: { code: INVALID_REQUEST, message: "Invalid Request" },
          id: body.id ?? -1,
        },
        400,
        {
          ...(sessionId && { SESSION_ID_HEADER: sessionId }),
        },
      );

      return result;
    }
  } catch (error) {
    console.error(error);
    // Handle parsing errors
    const sessionId = req.headers.get(SESSION_ID_HEADER);
    const result = createJsonResponse(
      {
        jsonrpc: JSONRPC_VERSION,
        error: {
          code: PARSE_ERROR,
          message: "Parse error",
        },
        id: -1,
      },
      400,
      {
        "Content-Type": "application/json",
        ...(sessionId && { SESSION_ID_HEADER: sessionId }),
      },
    );

    return result;
  }
}

/**
 * Handles GET requests to the MCP endpoint
 * Since we're avoiding SSE, we return 405 Method Not Allowed
 */
export async function GET(req: Request) {
  const sessionId = req.headers.get(SESSION_ID_HEADER);

  // Check if session exists
  if (sessionId) {
    return createJsonResponse(
      { error: "Session not found" },
      404,
      {
        "Content-Type": "application/json",
        ...(sessionId && { SESSION_ID_HEADER: sessionId }),
      },
    );
  }

  // Since we're avoiding SSE, return 405 Method Not Allowed
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Allow": "POST",
  };

  // Add session ID to headers if present
  if (sessionId) {
    headers[SESSION_ID_HEADER] = sessionId;
  }

  return createJsonResponse(
    { error: "Method not allowed. SSE not supported" },
    405,
    headers,
  );
}
