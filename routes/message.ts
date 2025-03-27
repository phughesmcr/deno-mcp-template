import { getTransport } from "../src/transport.ts";

/**
 * Handle POST requests to send messages to the server
 */
export async function POST(req: Request): Promise<Response> {
  const acceptHeader = req.headers.get("Accept");
  if (!acceptHeader) {
    return new Response(
      "Accept header is required",
      { status: 406 },
    );
  }

  // Get session ID from query parameter first (2024-11-05 standard approach)
  // Fall back to header and body if not found in query
  const url = new URL(req.url);
  const sessionIdFromQuery = url.searchParams.get("sessionId");

  let sessionId = sessionIdFromQuery;

  // If not in query params, check other locations as fallbacks
  if (!sessionId) {
    const clone = req.clone();
    try {
      const data = await clone.json();
      sessionId = req.headers.get("Mcp-Session-Id") ??
        (data.id || data.sessionId || data["Mcp-Session-Id"]);
    } catch (error) {
      console.error(error);
      return new Response("Invalid request body", { status: 400 });
    }
  }

  if (!sessionId) {
    return new Response("Session ID not found", { status: 400 });
  }

  const transport = getTransport(sessionId);

  if (!transport) {
    return new Response("No transport found for session", { status: 400 });
  }

  try {
    return await transport.handlePostMessage(req);
  } catch (error) {
    console.error(error);
    return new Response("Invalid JSON", { status: 400 });
  }
}
