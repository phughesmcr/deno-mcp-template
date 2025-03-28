import type { JSONRPCMessage } from "../../vendor/schema.ts";

export * from "./http.ts";
export * from "./sse.ts";

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
 *
 * @see {@link https://github.com/modelcontextprotocol/servers/blob/main/src/transport.ts}
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
