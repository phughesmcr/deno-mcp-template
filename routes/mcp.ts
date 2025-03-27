import type { JSONRPCMessage, JSONRPCRequest } from "../vendor/schema.ts";

/**
 * Handles POST requests to the MCP endpoint
 * Processes JSON-RPC messages from the client
 */
export async function POST(req: Request) {
  try {
    // Validate content type
    const contentType = req.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return new Response(
        JSON.stringify({ error: "Content-Type must be application/json" }),
        { status: 415, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check Accept header
    const acceptHeader = req.headers.get("accept");
    if (
      !acceptHeader ||
      !(acceptHeader.includes("application/json") || acceptHeader.includes("text/event-stream"))
    ) {
      return new Response(
        JSON.stringify({
          error: "Accept header must include application/json or text/event-stream",
        }),
        { status: 406, headers: { "Content-Type": "application/json" } },
      );
    }

    // Extract session ID if present
    const sessionId = req.headers.get("Mcp-Session-Id");

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
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: "batch", result: {} }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...(sessionId && { "Mcp-Session-Id": sessionId }),
            },
          },
        );
      }
    } else if ("id" in body && "method" in body) {
      // Single request
      const request = body as JSONRPCRequest;

      // Handle initialization specially to assign session ID
      if (request.method === "initialize") {
        const newSessionId = sessionId || generateSessionId();
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              protocolVersion: "2025-03-26",
              serverInfo: { name: "Simple MCP Server", version: "1.0.0" },
              capabilities: {},
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Mcp-Session-Id": newSessionId,
            },
          },
        );
      }

      // Process other requests
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: {},
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...(sessionId && { "Mcp-Session-Id": sessionId }),
          },
        },
      );
    } else if ("method" in body && !("id" in body)) {
      // Single notification
      return new Response(null, {
        status: 202,
        headers: {
          ...(sessionId && { "Mcp-Session-Id": sessionId }),
        },
      });
    } else if ("id" in body && "result" in body) {
      // Single response
      return new Response(null, {
        status: 202,
        headers: {
          ...(sessionId && { "Mcp-Session-Id": sessionId }),
        },
      });
    } else {
      // Invalid message
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "Invalid Request",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (error) {
    console.error(error);
    // Handle parsing errors
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32700,
          message: "Parse error",
        },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * Handles GET requests to the MCP endpoint
 * Since we're avoiding SSE, we return 405 Method Not Allowed
 */
export async function GET(req: Request) {
  const sessionId = req.headers.get("Mcp-Session-Id");

  // Check if session exists
  if (sessionId && !isValidSession(sessionId)) {
    return new Response(null, {
      status: 404,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  // Since we're avoiding SSE, return 405 Method Not Allowed
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Allow": "POST",
  };

  // Add session ID to headers if present
  if (sessionId) {
    headers["Mcp-Session-Id"] = sessionId;
  }

  return new Response(
    JSON.stringify({ error: "Method not allowed. SSE not supported" }),
    { status: 405, headers },
  );
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Check if a session ID is valid
 */
function isValidSession(_sessionId: string): boolean {
  // Implement session validation logic
  // For simplicity, we'll just return true
  return true;
}
