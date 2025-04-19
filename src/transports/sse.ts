import type { JSONRPCMessage } from "../../vendor/schema.ts";
import type { Transport } from "../types.ts";
import { textEncoder } from "../utils.ts";

const transports: Record<string, SSEServerTransport> = {};

export const getTransport = (sessionId: string): SSEServerTransport | undefined => {
  return transports[sessionId];
};

export const addTransport = (sessionId: string, transport: SSEServerTransport): void => {
  transports[sessionId] = transport;
};

// SSE server transport implementation
export class SSEServerTransport implements Transport {
  #sessionId: string;
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  #closed = false;
  #eventId = 0;
  #isStarted = false;
  #messageEndpoint: string;

  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor(messageEndpoint: string = "/message") {
    this.#sessionId = crypto.randomUUID();
    this.#messageEndpoint = messageEndpoint;
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  get isClosed(): boolean {
    return this.#closed;
  }

  async start(): Promise<void> {
    if (this.#isStarted) return;
    this.#isStarted = true;
    // Ensure we have a controller before trying to send anything
    if (this.#controller) {
      this.#sendEndpointEvent();
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Early return if transport is marked as closed or no controller
    if (this.#closed || !this.#controller) return;

    try {
      this.#eventId++;
      const data = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
      this.#controller.enqueue(textEncoder.encode(data));
    } catch (error) {
      // If we encounter a "stream already closed" type error,
      // mark the transport as closed to prevent further attempts
      if (
        error instanceof Error &&
        (error.message.includes("closed") || error.message.includes("enqueue"))
      ) {
        console.error("Stream appears to be closed, marking transport as closed");
        // Mark as closed but don't try to close the controller again
        this.#closed = true;
        this.#controller = null;

        // Notify about closure if callback is set
        if (this.onclose) {
          this.onclose();
        }
      }

      this.#handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;

    this.#closed = true;
    delete transports[this.#sessionId];

    if (this.#controller) {
      try {
        this.#controller.close();
      } catch (error) {
        console.error("Note: Stream already closed", error);
      }
      this.#controller = null;
    }

    if (this.onclose) {
      this.onclose();
    }
  }

  setupStream(controller: ReadableStreamDefaultController<Uint8Array>, lastEventId?: string): void {
    this.#controller = controller;

    // If we have a last event ID, we might want to resend missed messages
    if (lastEventId) {
      const lastId = parseInt(lastEventId, 10);
      if (!isNaN(lastId)) {
        this.#eventId = lastId;
        // Here you could implement logic to resend missed messages
      }
    }
  }

  #sendEndpointEvent(): void {
    if (!this.#controller) return;
    const endpoint = `${this.#messageEndpoint}?sessionId=${this.#sessionId}`;
    const endpointEvent = `event: endpoint\ndata: ${endpoint}\n\n`;
    this.#controller.enqueue(textEncoder.encode(endpointEvent));
  }

  async handlePostMessage(req: Request): Promise<Response> {
    if (this.#closed) {
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
      this.#handleError(error instanceof Error ? error : new Error(String(error)));
      return new Response("Invalid JSON", { status: 400 });
    }
  }

  #handleError(error: Error): void {
    if (this.onerror) {
      this.onerror(error);
    }
  }
}
