import type { JSONRPCMessage } from "../../vendor/schema.ts";
import { MAXIMUM_MESSAGE_SIZE } from "../constants.ts";
import { textEncoder } from "../utils.ts";
import type { Transport } from "./mod.ts";

interface StreamConnection {
  response: Response;
  controller: ReadableStreamDefaultController<Uint8Array>;
  lastEventId?: string;
  messages: Array<{ id: string; message: JSONRPCMessage }>;
  // mark this connection as a response to a specific request
  requestId?: string | null;
}

/**
 * Server transport for Streamable HTTP: this implements the MCP Streamable HTTP transport specification.
 * It supports both SSE streaming and direct HTTP responses, with session management and message resumability.
 */
export class StreamableHTTPServerTransport implements Transport {
  _connections: Map<string, StreamConnection> = new Map();
  _sessionId: string;
  _messageHistory: Map<string, {
    message: JSONRPCMessage;
    connectionId?: string; // record which connection the message should be sent to
  }> = new Map();
  _started: boolean = false;
  _requestConnections: Map<string, string> = new Map(); // request ID to connection ID mapping
  _endpoint: string;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(endpoint: string) {
    this._sessionId = crypto.randomUUID();
    this._endpoint = endpoint;
  }

  /**
   * Starts the transport. This is required by the Transport interface.
   * Made idempotent to handle potential multiple calls from the SDK.
   */
  async start(): Promise<void> {
    if (this._started) {
      // No error when already started - allows the SDK to call this safely
      console.error("Transport already started, ignoring duplicate start request");
      return;
    }
    this._started = true;
    console.error("Transport started successfully with session ID:", this._sessionId);
  }

  /**
   * Handles an incoming HTTP request
   */
  async handleRequest(req: Request): Promise<Response> {
    // validate the session ID
    const sessionId = req.headers.get("mcp-session-id");
    if (sessionId && sessionId !== this._sessionId) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found" },
          id: null,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    if (req.method === "GET") {
      return this.handleGetRequest(req);
    } else if (req.method === "POST") {
      return this.handlePostRequest(req);
    } else if (req.method === "DELETE") {
      return this.handleDeleteRequest(req);
    } else {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed" },
          id: null,
        }),
        { status: 405, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  /**
   * Handles GET requests to establish SSE connections
   */
  private async handleGetRequest(req: Request): Promise<Response> {
    // validate the Accept header
    const acceptHeader = req.headers.get("accept");
    if (!acceptHeader || !acceptHeader.includes("text/event-stream")) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Not Acceptable: Client must accept text/event-stream",
          },
          id: null,
        }),
        { status: 406, headers: { "Content-Type": "application/json" } },
      );
    }

    const connectionId = crypto.randomUUID();
    const lastEventId = req.headers.get("last-event-id");

    // Create a new transform stream for this connection
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Create response with SSE headers
    const response = new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Mcp-Session-Id": this._sessionId,
      },
    });

    // Set up stream controller
    const connection: StreamConnection = {
      response,
      controller: {
        enqueue: (chunk: Uint8Array) => {
          writer.write(chunk).catch((err) => {
            console.error("Error writing to stream:", err);
            this._connections.delete(connectionId);
          });
        },
        close: () => {
          writer.close().catch((err) => {
            console.error("Error closing writer:", err);
          });
        },
        error: (err: unknown) => {
          writer.abort(err).catch((e) => {
            console.error("Error aborting writer:", e);
          });
        },
        desiredSize: null,
      } as ReadableStreamDefaultController<Uint8Array>,
      lastEventId: lastEventId ?? undefined,
      messages: [],
    };

    this._connections.set(connectionId, connection);

    // If there is a Last-Event-ID, replay messages on this connection
    if (lastEventId) {
      this.replayMessages(connectionId, lastEventId);
    }

    // Handle connection close
    try {
      // Send an initial keepalive comment to avoid Deno closing the connection
      connection.controller.enqueue(textEncoder.encode(": keepalive\n\n"));

      // Clean up the connection when the readable stream is done
      // This is a safer approach in Deno than relying on response.body?.getReader().closed
      queueMicrotask(() => {
        // Clean up on a separate microtask to avoid errors from Deno
        this.setupConnectionCleanup(connectionId);
      });
    } catch (error) {
      console.error("Error setting up SSE connection:", error);
      this._connections.delete(connectionId);
      throw error;
    }

    return response;
  }

  /**
   * Set up cleanup for a connection when it closes
   */
  private setupConnectionCleanup(connectionId: string): void {
    const connection = this._connections.get(connectionId);
    if (!connection) return;

    // We need to monitor if the connection is still active
    // In Deno, we can't directly attach to the ReadableStream's closed promise
    // because of potential locking issues, so we'll use a timer to check periodically
    const checkInterval = setInterval(() => {
      // If the connection is no longer in our map, clean up the interval
      if (!this._connections.has(connectionId)) {
        clearInterval(checkInterval);
        return;
      }

      // Send a keepalive to check if the connection is still active
      try {
        connection.controller.enqueue(textEncoder.encode(": keepalive\n\n"));
      } catch (_err) {
        // If we can't send, the connection is probably closed
        console.error("Connection appears to be closed, cleaning up");
        clearInterval(checkInterval);
        this.cleanupConnection(connectionId);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Clean up resources associated with a connection
   */
  private cleanupConnection(connectionId: string): void {
    this._connections.delete(connectionId);

    // Remove all request mappings associated with this connection
    for (const [reqId, connId] of this._requestConnections.entries()) {
      if (connId === connectionId) {
        this._requestConnections.delete(reqId);
      }
    }

    // If no connections left, trigger onclose
    if (this._connections.size === 0) {
      this.onclose?.();
    }
  }

  /**
   * Handles POST requests containing JSON-RPC messages
   */
  private async handlePostRequest(req: Request): Promise<Response> {
    try {
      // validate the Accept header
      const acceptHeader = req.headers.get("accept");
      if (
        !acceptHeader ||
        (!acceptHeader.includes("application/json") &&
          !acceptHeader.includes("text/event-stream"))
      ) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message:
                "Not Acceptable: Client must accept application/json and/or text/event-stream",
            },
            id: null,
          }),
          { status: 406, headers: { "Content-Type": "application/json" } },
        );
      }

      const contentType = req.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Unsupported Media Type: Content-Type must be application/json",
            },
            id: null,
          }),
          { status: 415, headers: { "Content-Type": "application/json" } },
        );
      }

      // Check content length to prevent huge payloads
      const contentLength = req.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAXIMUM_MESSAGE_SIZE) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Payload too large",
            },
            id: null,
          }),
          { status: 413, headers: { "Content-Type": "application/json" } },
        );
      }

      // Clone the request to avoid consuming it twice (important for Deno)
      const bodyText = await req.text();
      const rawMessage = JSON.parse(bodyText);

      let messages: JSONRPCMessage[];
      // handle batch and single messages
      if (Array.isArray(rawMessage)) {
        messages = rawMessage;
      } else {
        messages = [rawMessage];
      }

      // check if it contains requests
      const hasRequests = messages.some(
        (msg) => "method" in msg && "id" in msg,
      );
      const hasOnlyNotificationsOrResponses = messages.every(
        (msg) =>
          ("method" in msg && !("id" in msg)) ||
          "result" in msg ||
          "error" in msg,
      );

      if (hasOnlyNotificationsOrResponses) {
        // if it only contains notifications or responses, return 202
        for (const message of messages) {
          this.onmessage?.(message);
        }
        return new Response(null, {
          status: 202,
          headers: {
            "Mcp-Session-Id": this._sessionId,
          },
        });
      } else if (hasRequests) {
        // if it contains requests, you can choose to return an SSE stream or a JSON response
        const useSSE = acceptHeader.includes("text/event-stream");

        if (useSSE) {
          // Create a new transform stream for this connection
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const connectionId = crypto.randomUUID();

          const response = new Response(readable, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "Mcp-Session-Id": this._sessionId,
            },
          });

          const connection: StreamConnection = {
            response,
            controller: {
              enqueue: (chunk: Uint8Array) => {
                writer.write(chunk).catch((err) => {
                  console.error("Error writing to stream:", err);
                  this._connections.delete(connectionId);
                });
              },
              close: () => {
                writer.close().catch((err) => {
                  console.error("Error closing writer:", err);
                });
              },
              error: (err: unknown) => {
                writer.abort(err).catch((e) => {
                  console.error("Error aborting writer:", e);
                });
              },
              desiredSize: null,
            } as ReadableStreamDefaultController<Uint8Array>,
            messages: [],
          };

          this._connections.set(connectionId, connection);

          // Send an initial keepalive comment
          connection.controller.enqueue(textEncoder.encode(": keepalive\n\n"));

          // map each request to a connection ID
          for (const message of messages) {
            if ("method" in message && "id" in message) {
              this._requestConnections.set(String(message.id), connectionId);
            }
            this.onmessage?.(message);
          }

          // Set up connection cleanup similar to GET requests
          queueMicrotask(() => {
            this.setupConnectionCleanup(connectionId);
          });

          return response;
        } else {
          // use direct JSON response
          for (const message of messages) {
            this.onmessage?.(message);
          }

          return new Response(null, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Mcp-Session-Id": this._sessionId,
            },
          });
        }
      }

      // Default response if message type can't be determined
      return new Response(null, {
        status: 202,
        headers: {
          "Mcp-Session-Id": this._sessionId,
        },
      });
    } catch (error) {
      // return JSON-RPC formatted error
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error",
            data: String(error),
          },
          id: null,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  /**
   * Handles DELETE requests to terminate sessions
   */
  private async handleDeleteRequest(_req: Request): Promise<Response> {
    await this.close();
    return new Response(null, { status: 200 });
  }

  /**
   * Replays messages after the specified event ID for a specific connection
   */
  private replayMessages(connectionId: string, lastEventId: string): void {
    if (!lastEventId) return;

    // only replay messages that should be sent on this connection
    const messages = Array.from(this._messageHistory.entries())
      .filter(
        ([id, { connectionId: msgConnId }]) =>
          id > lastEventId && (!msgConnId || msgConnId === connectionId),
      ) // only replay messages that are not specified to a connection or specified to the current connection
      .sort(([a], [b]) => a.localeCompare(b));

    const connection = this._connections.get(connectionId);
    if (!connection) return;

    for (const [id, { message }] of messages) {
      connection.controller.enqueue(
        textEncoder.encode(
          `id: ${id}\nevent: message\ndata: ${JSON.stringify(message)}\n\n`,
        ),
      );
    }
  }

  async close(): Promise<void> {
    for (const connection of this._connections.values()) {
      connection.controller.close();
    }
    this._connections.clear();
    this._messageHistory.clear();
    this._requestConnections.clear();
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this._connections.size === 0) {
      throw new Error("No active connections");
    }

    let targetConnectionId = "";

    // if it is a response, find the corresponding request connection
    if ("id" in message && ("result" in message || "error" in message)) {
      const connId = this._requestConnections.get(String(message.id));
      // if the corresponding connection is not found, the connection may be disconnected
      if (!connId || !this._connections.has(connId)) {
        // select an available connection
        const firstConnId = this._connections.keys().next().value;
        if (firstConnId) {
          targetConnectionId = firstConnId;
        } else {
          throw new Error("No available connections");
        }
      } else {
        targetConnectionId = connId;
      }
    } else {
      // for other messages, select an available connection
      const firstConnId = this._connections.keys().next().value;
      if (firstConnId) {
        targetConnectionId = firstConnId;
      } else {
        throw new Error("No available connections");
      }
    }

    const messageId = crypto.randomUUID();
    this._messageHistory.set(messageId, {
      message,
      connectionId: targetConnectionId,
    });

    // keep the message history in a reasonable range
    if (this._messageHistory.size > 1000) {
      const oldestKey = Array.from(this._messageHistory.keys())[0];
      if (oldestKey) {
        this._messageHistory.delete(oldestKey);
      }
    }

    // send the message to all active connections
    for (const [connId, connection] of this._connections.entries()) {
      // if it is a response message, only send to the target connection
      if ("id" in message && ("result" in message || "error" in message)) {
        if (connId === targetConnectionId) {
          connection.controller.enqueue(
            textEncoder.encode(
              `id: ${messageId}\nevent: message\ndata: ${JSON.stringify(message)}\n\n`,
            ),
          );
        }
      } else {
        // for other messages, send to all connections
        connection.controller.enqueue(
          textEncoder.encode(
            `id: ${messageId}\nevent: message\ndata: ${JSON.stringify(message)}\n\n`,
          ),
        );
      }
    }
  }

  /**
   * Returns the session ID for this transport
   */
  get sessionId(): string {
    return this._sessionId;
  }
}
