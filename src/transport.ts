import type { JSONRPCMessage } from "../vendor/schema.ts";
import { textEncoder } from "./utils.ts";

/**
 * Represents a message in the Server-Sent Event (SSE) protocol.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#fields}
 */
export interface ServerSentEventMessage {
  /** Ignored by the client. */
  comment?: string;
  /** A string identifying the type of event described. */
  event?: string;
  /** The data field for the message. Split by new lines. */
  data?: string;
  /** The event ID to set the {@linkcode EventSource} object's last event ID value. */
  id?: string | number;
  /** The reconnection time. */
  retry?: number;
}

/**
 * Describes the minimal contract for a MCP transport that a client or server can communicate over.
 */
export interface Transport {
  /**
   * Starts processing messages on the transport, including any connection steps that might need to be taken.
   *
   * This method should only be called after callbacks are installed, or else messages may be lost.
   *
   * NOTE: This method should not be called explicitly when using Client, Server, or Protocol classes, as they will implicitly call start().
   */
  start(): Promise<void>;

  /**
   * Sends a JSON-RPC message (request or response).
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * Closes the connection.
   */
  close(): Promise<void>;

  /**
   * Callback for when the connection is closed for any reason.
   *
   * This should be invoked when close() is called as well.
   */
  onclose?: () => void;

  /**
   * Callback for when an error occurs.
   *
   * Note that errors are not necessarily fatal; they are used for reporting any kind of exceptional condition out of band.
   */
  onerror?: (error: Error) => void;

  /**
   * Callback for when a message (request or response) is received over the connection.
   */
  onmessage?: (message: JSONRPCMessage) => void;

  /**
   * The session ID generated for this connection.
   */
  sessionId?: string;
}

const transports: Record<string, SSEServerTransport> = {};

export const getTransport = (sessionId: string): SSEServerTransport | undefined => {
  return transports[sessionId];
};

export const addTransport = (sessionId: string, transport: SSEServerTransport): void => {
  transports[sessionId] = transport;
};

// SSE server transport implementation
export class SSEServerTransport implements Transport {
  readonly sessionId: string;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private closed = false;
  private eventId = 0;
  private isStarted = false;
  private messageEndpoint: string;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor(messageEndpoint: string = "/message") {
    this.sessionId = crypto.randomUUID();
    this.messageEndpoint = messageEndpoint;
  }

  /**
   * Check if the transport is closed
   */
  get isClosed(): boolean {
    return this.closed;
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;
    // Ensure we have a controller before trying to send anything
    if (this.controller) {
      this.sendEndpointEvent();
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Early return if transport is marked as closed or no controller
    if (this.closed || !this.controller) return;

    try {
      this.eventId++;
      const data = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
      this.controller.enqueue(textEncoder.encode(data));
    } catch (error) {
      // If we encounter a "stream already closed" type error,
      // mark the transport as closed to prevent further attempts
      if (
        error instanceof Error &&
        (error.message.includes("closed") || error.message.includes("enqueue"))
      ) {
        console.error("Stream appears to be closed, marking transport as closed");
        // Mark as closed but don't try to close the controller again
        this.closed = true;
        this.controller = null;

        // Notify about closure if callback is set
        if (this.onclose) {
          this.onclose();
        }
      }

      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;

    this.closed = true;
    delete transports[this.sessionId];

    if (this.controller) {
      try {
        this.controller.close();
      } catch (error) {
        console.error("Note: Stream already closed", error);
      }
      this.controller = null;
    }

    if (this.onclose) {
      this.onclose();
    }
  }

  setupStream(controller: ReadableStreamDefaultController<Uint8Array>, lastEventId?: string): void {
    this.controller = controller;

    // If we have a last event ID, we might want to resend missed messages
    if (lastEventId) {
      const lastId = parseInt(lastEventId, 10);
      if (!isNaN(lastId)) {
        this.eventId = lastId;
        // Here you could implement logic to resend missed messages
      }
    }
  }

  /**
   * Sends the required endpoint event as per MCP 2024-11-05 spec
   */
  private sendEndpointEvent(): void {
    if (!this.controller) return;
    const endpoint = `${this.messageEndpoint}?sessionId=${this.sessionId}`;
    const endpointEvent = `event: endpoint\ndata: ${endpoint}\n\n`;
    this.controller.enqueue(textEncoder.encode(endpointEvent));
  }

  async handlePostMessage(req: Request): Promise<Response> {
    if (this.closed) {
      return new Response("Transport closed", { status: 410 });
    }

    try {
      const message = await req.json() as JSONRPCMessage;

      // Route the message to the MCP server via the onmessage callback
      if (this.onmessage) {
        this.onmessage(message);
      }

      // According to 2024-11-05 spec, all POST messages should be accepted with 202
      // The server will process requests and send responses over the SSE stream later
      return new Response(null, {
        status: 202,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return new Response("Invalid JSON", { status: 400 });
    }
  }

  private handleError(error: Error): void {
    if (this.onerror) {
      this.onerror(error);
    }
  }
}
