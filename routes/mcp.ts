import { KV, MCP_SERVER_NAME, SESSION_ID_HEADER, THIRTY_MINUTES } from "../src/constants.ts";
import { createJsonResponse } from "../src/utils.ts";
import {
  INVALID_REQUEST,
  JSONRPC_VERSION,
  type JSONRPCError,
  type JSONRPCMessage,
  type JSONRPCNotification,
  type JSONRPCRequest,
  type JSONRPCResponse,
  LATEST_PROTOCOL_VERSION,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  type RequestId,
} from "../vendor/schema.ts";
import type { Server } from "@modelcontextprotocol/sdk/server";

// Data structures for request tracking and cancellation
interface CancellableRequest {
  requestId: RequestId;
  sessionId: string;
  controller?: AbortController;
  timestamp: number;
  cancelled: boolean;
}

// Map of sessionId -> requestId -> CancellableRequest
const activeRequests: Map<string, Map<RequestId, CancellableRequest>> = new Map();

/**
 * Registers a request as cancellable
 */
function registerCancellableRequest(
  sessionId: string,
  requestId: RequestId,
  controller?: AbortController,
): void {
  if (!activeRequests.has(sessionId)) {
    activeRequests.set(sessionId, new Map());
  }

  const sessionRequests = activeRequests.get(sessionId)!;
  sessionRequests.set(requestId, {
    requestId,
    sessionId,
    controller,
    timestamp: Date.now(),
    cancelled: false,
  });
}

/**
 * Checks if a request has been cancelled
 */
function isRequestCancelled(sessionId: string, requestId: RequestId): boolean {
  const sessionRequests = activeRequests.get(sessionId);
  if (!sessionRequests) return false;

  const request = sessionRequests.get(requestId);
  return request ? request.cancelled : false;
}

/**
 * Removes a request from the active requests map
 */
function removeRequest(sessionId: string, requestId: RequestId): void {
  const sessionRequests = activeRequests.get(sessionId);
  if (!sessionRequests) return;

  sessionRequests.delete(requestId);

  // Clean up session if no more requests
  if (sessionRequests.size === 0) {
    activeRequests.delete(sessionId);
  }
}

/**
 * Cancels an active request
 */
function cancelRequest(sessionId: string, requestId: RequestId): boolean {
  const sessionRequests = activeRequests.get(sessionId);
  if (!sessionRequests) return false;

  const request = sessionRequests.get(requestId);
  if (!request) return false;

  // Abort the request if there's an AbortController
  if (request.controller) {
    request.controller.abort();
  }

  // Mark the request as cancelled
  request.cancelled = true;

  return true;
}

/**
 * Cleans up old cancelled requests to prevent memory leaks
 */
function cleanupCancelledRequests(maxAgeMs = 60000): void {
  const now = Date.now();

  for (const [sessionId, sessionRequests] of activeRequests.entries()) {
    for (const [requestId, request] of sessionRequests.entries()) {
      // Remove requests that have been cancelled for a while
      if (request.cancelled && now - request.timestamp > maxAgeMs) {
        sessionRequests.delete(requestId);
      }
    }

    // Clean up session if no more requests
    if (sessionRequests.size === 0) {
      activeRequests.delete(sessionId);
    }
  }
}

// Define type for method handlers
type RequestHandler = (
  request: JSONRPCRequest,
  sessionId: string | null,
  server: Server,
) => Promise<JSONRPCResponse | JSONRPCError>;

type NotificationHandler = (
  notification: JSONRPCNotification,
  sessionId: string | null,
  server: Server,
) => Promise<void>;

// Method handler registries
const requestHandlers: Record<string, RequestHandler> = {};
const notificationHandlers: Record<string, NotificationHandler> = {};

/**
 * Initialize method handler
 */
const handleInitialize: RequestHandler = async (request, _sessionId, server) => {
  return {
    jsonrpc: JSONRPC_VERSION,
    id: request.id,
    result: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: server.getClientVersion(),
      },
      capabilities: server.getClientCapabilities(),
    },
  };
};

/**
 * Shutdown method handler
 */
const handleShutdown: RequestHandler = async (request) => {
  return {
    jsonrpc: JSONRPC_VERSION,
    id: request.id,
    result: {},
  };
};

/**
 * Ping method handler
 */
const handlePing: RequestHandler = async (request) => {
  return {
    jsonrpc: JSONRPC_VERSION,
    id: request.id,
    result: {},
  };
};

/**
 * CancelledNotification handler
 */
const handleCancelled: NotificationHandler = async (notification, sessionId) => {
  if (!sessionId) {
    console.error("Received cancel notification without a session ID");
    return;
  }

  if (
    notification.params && typeof notification.params === "object" && notification.params !== null
  ) {
    if ("requestId" in notification.params) {
      const requestId = notification.params["requestId"] as RequestId;
      const cancelled = cancelRequest(sessionId, requestId);

      if (cancelled) {
        console.log(`Request ${String(requestId)} in session ${sessionId} was cancelled`);
      } else {
        console.log(
          `Request ${String(requestId)} in session ${sessionId} not found for cancellation`,
        );
      }
    } else {
      console.error("Invalid cancel notification, missing requestId");
    }
  } else {
    console.error("Invalid cancel notification params");
  }
};

// Register handlers
requestHandlers["initialize"] = handleInitialize;
requestHandlers["shutdown"] = handleShutdown;
requestHandlers["ping"] = handlePing;
notificationHandlers["notifications/cancelled"] = handleCancelled;

/**
 * Process a single request using the method registry
 */
async function processRequest(
  request: JSONRPCRequest,
  sessionId: string | null,
  server: Server,
): Promise<JSONRPCResponse | JSONRPCError> {
  // Get the handler for this method
  const handler = requestHandlers[request.method];

  if (handler) {
    // Register the request as cancellable if we have a session
    if (sessionId && request.id) {
      const controller = new AbortController();
      registerCancellableRequest(sessionId, request.id, controller);

      try {
        // Periodically check for cancellation during long-running requests
        const checkCancellation = async () => {
          if (sessionId && request.id && isRequestCancelled(sessionId, request.id)) {
            controller.abort();
            throw new Error(`Request ${String(request.id)} was cancelled`);
          }
        };

        // Execute the handler with cancellation support
        const response = await Promise.race([
          handler(request, sessionId, server),
          // Set up a recurring check for cancellation
          (async () => {
            while (true) {
              await new Promise((resolve) => setTimeout(resolve, 100)); // Check every 100ms
              await checkCancellation();
            }
          })().then(() => {
            // This branch should never complete normally
            throw new Error("Unexpected completion of cancellation checker");
          }),
        ]);

        // Clean up after successful completion
        removeRequest(sessionId, request.id);

        return response;
      } catch (error) {
        // Clean up on error
        removeRequest(sessionId, request.id);

        // If the error was due to cancellation, return a specific error
        if (error instanceof Error && error.message.includes("was cancelled")) {
          return {
            jsonrpc: JSONRPC_VERSION,
            id: request.id,
            error: {
              code: INVALID_REQUEST,
              message: "Request was cancelled",
            },
          };
        }

        // Re-throw other errors
        throw error;
      }
    } else {
      // Not a cancellable request (no session or no ID)
      return await handler(request, sessionId, server);
    }
  } else {
    // Method not found
    return {
      jsonrpc: JSONRPC_VERSION,
      id: request.id,
      error: {
        code: METHOD_NOT_FOUND,
        message: `Method '${request.method}' not found`,
      },
    };
  }
}

/**
 * Process a single notification using the notification registry
 */
async function processNotification(
  notification: JSONRPCNotification,
  sessionId: string | null,
  server: Server,
): Promise<void> {
  // Get the handler for this notification
  const handler = notificationHandlers[notification.method];

  if (handler) {
    // Execute the handler
    await handler(notification, sessionId, server);
  } else {
    // Just log that the notification wasn't handled
    console.warn(`No handler for notification method: ${notification.method}`);
  }
}

// Define the enhanced session data structure
interface SessionData {
  lastActivity: number;
  messageHistory: MessageEntry[];
  messageCount: number;
}

interface MessageEntry {
  sequenceId: string;
  message: JSONRPCMessage;
  timestamp: number;
}

// ["sessions", sessionId] -> { lastActivity: number }
const getLastActivityKey = (sessionId: string) => ["sessions", sessionId];

// ["sessions", sessionId, "messages", sequenceId] -> { message: JSONRPCMessage, timestamp: number }
const getMessageKey = (
  sessionId: string,
  sequenceId: string,
) => ["sessions", sessionId, "messages", sequenceId];

// Session management functions using KV

/**
 * Creates a new session and returns the session ID
 */
async function createSession(): Promise<string> {
  const sessionId = crypto.randomUUID();
  const sessionData: SessionData = {
    lastActivity: Date.now(),
    messageHistory: [],
    messageCount: 0,
  };
  await KV.set(getLastActivityKey(sessionId), sessionData);
  return sessionId;
}

/**
 * Validates if a session exists and is not expired
 */
async function validateSession(sessionId: string): Promise<boolean> {
  const sessionData = await KV.get<SessionData>(getLastActivityKey(sessionId));

  if (!sessionData.value) {
    return false;
  }

  const lastActivity = sessionData.value.lastActivity;
  if (Date.now() - lastActivity > SESSION_TIMEOUT) {
    // Session expired, clean up
    await KV.delete(getLastActivityKey(sessionId));

    // Delete all messages in the session
    const messagesToDelete = KV.list({ prefix: ["sessions", sessionId, "messages"] });
    for await (const entry of messagesToDelete) {
      await KV.delete(entry.key);
    }

    return false;
  }

  // Clean up cancelled requests while we're at it
  cleanupCancelledRequests();

  return true;
}

/**
 * Updates the last activity timestamp for a session
 */
async function updateSession(sessionId: string): Promise<void> {
  const sessionData = await KV.get<SessionData>(getLastActivityKey(sessionId));
  if (sessionData.value) {
    const data = sessionData.value;
    await KV.set(getLastActivityKey(sessionId), {
      ...data,
      lastActivity: Date.now(),
    });
  }
}

/**
 * Stores a message in the session history and returns the sequence ID
 */
async function storeMessage(sessionId: string, message: JSONRPCMessage): Promise<string> {
  const sessionData = await KV.get<SessionData>(getLastActivityKey(sessionId));

  if (!sessionData.value) {
    throw new Error("Session not found");
  }

  const messageCount = sessionData.value.messageCount + 1;
  const sequenceId = messageCount.toString();

  // Store the message
  await KV.set(getMessageKey(sessionId, sequenceId), {
    message,
    timestamp: Date.now(),
  });

  // Update the message counter in session data
  await KV.set(getLastActivityKey(sessionId), {
    ...sessionData.value,
    messageCount,
  });

  return sequenceId;
}

/**
 * Retrieves messages that were sent after the specified event ID
 */
async function getMissedMessages(
  sessionId: string,
  lastEventId: string,
): Promise<{ sequenceId: string; message: JSONRPCMessage }[]> {
  const missedMessages: { sequenceId: string; message: JSONRPCMessage }[] = [];

  // Convert lastEventId to a number for comparison
  const lastEventIdNum = parseInt(lastEventId, 10);

  if (isNaN(lastEventIdNum)) {
    return missedMessages;
  }

  // Get all messages with sequence IDs greater than lastEventId
  const messageEntries = KV.list<{ message: JSONRPCMessage; timestamp: number }>({
    prefix: ["sessions", sessionId, "messages"],
    start: ["sessions", sessionId, "messages", lastEventId],
  });

  for await (const entry of messageEntries) {
    // Skip the last seen message
    const key = entry.key;
    const currentSeqId = key[key.length - 1] as string;

    if (parseInt(currentSeqId, 10) > lastEventIdNum) {
      missedMessages.push({
        sequenceId: currentSeqId,
        message: entry.value.message,
      });
    }
  }

  return missedMessages;
}

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
        {
          jsonrpc: JSONRPC_VERSION,
          error: {
            code: INVALID_REQUEST,
            message: "Content-Type must be application/json",
          },
          id: null,
        },
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
        {
          jsonrpc: JSONRPC_VERSION,
          error: {
            code: INVALID_REQUEST,
            message: "Accept header must include application/json or text/event-stream",
          },
          id: null,
        },
        406,
      );
    }

    // Extract session ID if present
    const sessionId = req.headers.get(SESSION_ID_HEADER);

    // Validate session except for initialization requests
    if (sessionId) {
      // Check if session exists
      if (!await validateSession(sessionId)) {
        return createJsonResponse(
          {
            jsonrpc: JSONRPC_VERSION,
            error: {
              code: INVALID_REQUEST,
              message: "Session not found or expired",
            },
            id: null,
          },
          404,
          { [SESSION_ID_HEADER]: sessionId },
        );
      }

      // Update session activity
      await updateSession(sessionId);
    }

    // Parse the request body
    const body = await req.json() as JSONRPCMessage;

    // Handle different message types
    if (Array.isArray(body)) {
      // Check if the batch contains any requests
      const requests = body.filter((msg): msg is JSONRPCRequest =>
        "id" in msg && msg.id !== null && "method" in msg
      );

      // Check if the batch contains only notifications or responses
      const notifications = body.filter((msg): msg is JSONRPCNotification =>
        "method" in msg && (!("id" in msg) || msg.id === null)
      );

      const hasRequests = requests.length > 0;
      const hasOnlyNotificationsOrResponses = requests.length === 0;

      if (hasOnlyNotificationsOrResponses) {
        // Process notifications if there are any
        if (notifications.length > 0) {
          await Promise.all(
            notifications.map(async (notification) => {
              await processNotification(notification, sessionId, server);
            }),
          );
        }

        // Only notifications or responses, return 202 Accepted
        return new Response(null, {
          status: 202,
          headers: {
            ...(sessionId && { [SESSION_ID_HEADER]: sessionId }),
          },
        });
      } else if (hasRequests) {
        // Contains requests, determine if we should use SSE or JSON
        if (acceptHeader.includes("text/event-stream")) {
          // Start an SSE stream for responses
          const stream = new ReadableStream({
            start: async (controller) => {
              // Process requests in the batch
              const requests = body.filter((msg): msg is JSONRPCRequest =>
                "id" in msg && msg.id !== null && "method" in msg
              );

              // Process notifications in the batch
              const notifications = body.filter((msg): msg is JSONRPCNotification =>
                "method" in msg && (!("id" in msg) || msg.id === null)
              );

              // Process all requests asynchronously
              const responses = await Promise.all(
                requests.map(async (request) => {
                  return await processRequest(request, sessionId || null, server);
                }),
              );

              // Process all notifications asynchronously
              await Promise.all(
                notifications.map(async (notification) => {
                  await processNotification(notification, sessionId || null, server);
                }),
              );

              // Send an initial comment for keepalive
              controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));

              // Generate a new session ID for initialization if needed
              const newSessionId = sessionId || (
                body.some((r: unknown) =>
                    typeof r === "object" && r !== null && "method" in r &&
                    r.method === "initialize"
                  )
                  ? await createSession()
                  : undefined
              );

              // Send responses as SSE events with sequence IDs
              for (const response of responses) {
                if (newSessionId) {
                  const sequenceId = await storeMessage(newSessionId, response as JSONRPCMessage);
                  const data = `id: ${sequenceId}\ndata: ${JSON.stringify(response)}\n\n`;
                  controller.enqueue(new TextEncoder().encode(data));
                } else {
                  const data = `data: ${JSON.stringify(response)}\n\n`;
                  controller.enqueue(new TextEncoder().encode(data));
                }
              }

              controller.close();
            },
          });

          // Generate a new session ID for initialization if needed
          const newSessionId = sessionId || (
            body.some((r: unknown) =>
                typeof r === "object" && r !== null && "method" in r && r.method === "initialize"
              )
              ? await createSession()
              : undefined
          );

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              ...(newSessionId && { [SESSION_ID_HEADER]: newSessionId }),
            },
          });
        } else {
          // Return JSON responses
          // Process requests in the batch
          const requests = body.filter((msg): msg is JSONRPCRequest =>
            "id" in msg && msg.id !== null && "method" in msg
          );

          // Process notifications in the batch
          const notifications = body.filter((msg): msg is JSONRPCNotification =>
            "method" in msg && (!("id" in msg) || msg.id === null)
          );

          // Process all requests asynchronously
          const responses = await Promise.all(
            requests.map(async (request) => {
              return await processRequest(request, newSessionId || sessionId, server);
            }),
          );

          // Process all notifications asynchronously
          await Promise.all(
            notifications.map(async (notification) => {
              await processNotification(notification, newSessionId || sessionId, server);
            }),
          );

          // Generate a new session ID for initialization if needed
          const newSessionId = sessionId || (
            body.some((r: unknown) =>
                typeof r === "object" && r !== null && "method" in r && r.method === "initialize"
              )
              ? await createSession()
              : undefined
          );

          return createJsonResponse(
            responses.length === 1 ? responses[0] : responses,
            200,
            {
              ...(newSessionId && { [SESSION_ID_HEADER]: newSessionId }),
            },
          );
        }
      } else {
        // This shouldn't happen, but just in case we return a bad request response
        return createJsonResponse(
          {
            jsonrpc: JSONRPC_VERSION,
            error: { code: INVALID_REQUEST, message: "Invalid batch request format" },
            id: null,
          },
          400,
          {
            ...(sessionId && { [SESSION_ID_HEADER]: sessionId }),
          },
        );
      }
    } else if ("id" in body && body.id !== null && "method" in body) {
      // Single request
      const request = body as JSONRPCRequest;

      // Handle initialization specially to assign session ID
      if (request.method === "initialize") {
        const newSessionId = sessionId || await createSession();

        // Determine response format based on Accept header
        if (acceptHeader.includes("text/event-stream")) {
          const stream = new ReadableStream({
            start: async (controller) => {
              // Send an initial comment for keepalive
              controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));

              // Process the request using the method registry
              const response = await processRequest(request, newSessionId, server);

              // Store message and get sequence ID
              const sequenceId = await storeMessage(newSessionId, response as JSONRPCMessage);

              // Send response with sequence ID
              const data = `id: ${sequenceId}\ndata: ${JSON.stringify(response)}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
              controller.close();
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              [SESSION_ID_HEADER]: newSessionId,
            },
          });
        } else {
          const response = await processRequest(request, newSessionId, server);
          return createJsonResponse(response, 200, { [SESSION_ID_HEADER]: newSessionId });
        }
      }

      // For non-initialize requests that require a session
      if (!sessionId) {
        return createJsonResponse(
          {
            jsonrpc: JSONRPC_VERSION,
            error: { code: INVALID_REQUEST, message: "Session ID required" },
            id: request.id,
          },
          400,
        );
      }

      // For non-initialize requests
      if (acceptHeader.includes("text/event-stream")) {
        const stream = new ReadableStream({
          start: async (controller) => {
            // Send an initial comment for keepalive
            controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));

            // Process the request using the method registry
            const response = await processRequest(request, sessionId, server);

            // Store message and get sequence ID
            const sequenceId = await storeMessage(sessionId, response as JSONRPCMessage);

            // Send response with sequence ID
            const data = `id: ${sequenceId}\ndata: ${JSON.stringify(response)}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            [SESSION_ID_HEADER]: sessionId,
          },
        });
      } else {
        const response = await processRequest(request, sessionId, server);
        return createJsonResponse(response, 200, { [SESSION_ID_HEADER]: sessionId });
      }
    } else if ("method" in body && (!("id" in body) || body.id === null)) {
      // Single notification
      const notification = body as JSONRPCNotification;

      // Process the notification
      await processNotification(notification, sessionId, server);

      return new Response(null, {
        status: 202,
        headers: {
          ...(sessionId && { [SESSION_ID_HEADER]: sessionId }),
        },
      });
    } else if ("id" in body && "result" in body) {
      // Single response
      return new Response(null, {
        status: 202,
        headers: {
          ...(sessionId && { [SESSION_ID_HEADER]: sessionId }),
        },
      });
    } else {
      // Invalid message
      const result = createJsonResponse(
        {
          jsonrpc: JSONRPC_VERSION,
          error: { code: INVALID_REQUEST, message: "Invalid Request" },
          id: body.id ?? null,
        },
        400,
        {
          ...(sessionId && { [SESSION_ID_HEADER]: sessionId }),
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
        id: null,
      },
      400,
      {
        ...(sessionId && { [SESSION_ID_HEADER]: sessionId }),
      },
    );

    return result;
  }
}

/**
 * Handles GET requests to the MCP endpoint
 * Supports long-polling with SSE
 */
export async function GET(req: Request) {
  // Check Accept header - MUST include text/event-stream
  const acceptHeader = req.headers.get("accept");
  if (!acceptHeader || !acceptHeader.includes("text/event-stream")) {
    return createJsonResponse(
      {
        jsonrpc: JSONRPC_VERSION,
        error: {
          code: INVALID_REQUEST,
          message: "Accept header must include text/event-stream",
        },
        id: null,
      },
      406,
      { "Allow": "POST, GET, DELETE" },
    );
  }

  const sessionId = req.headers.get(SESSION_ID_HEADER);

  // Check if session exists and is valid
  if (sessionId && !await validateSession(sessionId)) {
    return createJsonResponse(
      {
        jsonrpc: JSONRPC_VERSION,
        error: { code: INVALID_REQUEST, message: "Session not found or expired" },
        id: null,
      },
      404,
      { [SESSION_ID_HEADER]: sessionId },
    );
  }

  // Update session if it exists
  if (sessionId) {
    await updateSession(sessionId);
  }

  // Check for Last-Event-ID header to support resumable streams
  const lastEventId = req.headers.get("Last-Event-ID");

  // Create SSE stream for long-polling
  const stream = new ReadableStream({
    start: async (controller) => {
      // Send initial keepalive comment
      controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));

      // If we have a session ID and last event ID, send missed messages
      if (sessionId && lastEventId) {
        const missedMessages = await getMissedMessages(sessionId, lastEventId);

        // Send all missed messages
        for (const { sequenceId, message } of missedMessages) {
          const data = `id: ${sequenceId}\ndata: ${JSON.stringify(message)}\n\n`;
          controller.enqueue(new TextEncoder().encode(data));
        }
      }

      // In a real implementation, you would wait for events to send
      // This implementation just sends a keepalive and closes after a short delay
      setTimeout(() => {
        controller.close();
      }, 5000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...(sessionId && { [SESSION_ID_HEADER]: sessionId }),
    },
  });
}

/**
 * Handles DELETE requests to the MCP endpoint
 * Used to explicitly terminate a session
 */
export async function DELETE(req: Request) {
  const sessionId = req.headers.get(SESSION_ID_HEADER);

  // No session ID provided
  if (!sessionId) {
    return createJsonResponse(
      {
        jsonrpc: JSONRPC_VERSION,
        error: { code: INVALID_REQUEST, message: "No session ID provided" },
        id: null,
      },
      400,
    );
  }

  // Delete the session and all its messages
  if (await validateSession(sessionId)) {
    // Delete session data
    await KV.delete(["sessions", sessionId]);

    // Delete all messages in the session
    const messagesToDelete = await KV.list({ prefix: ["sessions", sessionId, "messages"] });
    for await (const entry of messagesToDelete) {
      await KV.delete(entry.key);
    }
  }

  return new Response(null, {
    status: 200,
    headers: {
      [SESSION_ID_HEADER]: sessionId,
    },
  });
}
