import {
  HTTP_NOT_ACCEPTABLE_CODE,
  LAST_EVENT_ID_HEADER,
  SSE_MESSAGE_ENDPOINT,
  THIRTY_SECONDS,
} from "../src/constants.ts";
import { server } from "../src/mcp/mod.ts";
import { addTransport, SSEServerTransport } from "../src/transports/mod.ts";
import { JSONRPC_VERSION } from "../vendor/schema.ts";

export function GET(req: Request): Response {
  // Check if Accept header includes text/event-stream
  const acceptHeader = req.headers.get("Accept");
  if (!acceptHeader || !acceptHeader.includes("text/event-stream")) {
    return new Response("Accept header must include text/event-stream", {
      status: HTTP_NOT_ACCEPTABLE_CODE,
    });
  }

  const lastEventId = req.headers.get(LAST_EVENT_ID_HEADER);

  // Create a new transport
  const transport = new SSEServerTransport(SSE_MESSAGE_ENDPOINT);
  addTransport(transport.sessionId, transport);

  // Create a stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      transport.setupStream(controller, lastEventId || undefined);

      // Call start to initialize the transport and send the endpoint event
      // This must happen before connecting to the MCP server to ensure
      // the endpoint event is the first message sent
      transport.start().then(() => {
        // Connect the transport to MCP server only after start() completes
        server.connect(transport).catch((error) => {
          console.error("Error connecting transport:", error);
          transport.close();
        });
      }).catch((error) => {
        console.error("Error starting transport:", error);
        transport.close();
      });
    },
    cancel() {
      console.error(`Stream canceled by client, closing transport ${transport.sessionId}`);
      transport.close();
    },
  });

  // Set up a timer to detect if the client has disconnected
  // This is a safety mechanism in case the 'cancel' method isn't called on normal disconnection
  const disconnectDetector = setInterval(() => {
    if (!transport.isClosed) {
      // Try sending a ping to see if the client is still there
      try {
        transport.send({ jsonrpc: JSONRPC_VERSION, method: "ping", id: crypto.randomUUID() })
          .catch(() => {
            // If the send fails, close the transport
            console.error("Ping failed, client appears to be disconnected");
            transport.close();
          });
      } catch (error) {
        console.error("Error in disconnect detector:", error);
      }
    } else {
      clearInterval(disconnectDetector);
    }
  }, THIRTY_SECONDS);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Mcp-Session-Id": transport.sessionId,
    },
  });
}
