import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { APP_NAME } from "$/constants";
import type { AppConfig } from "$/types.ts";
import { InMemoryEventStore } from "../inMemoryEventStore.ts";
import type { Logger } from "../logger.ts";

/**
 * Manages HTTP transport instances for MCP server sessions.
 * Handles creation, tracking, and cleanup of transport connections with DNS rebinding protection.
 */
class HttpTransportManager {
  /** Map of session IDs to their corresponding transport instances */
  #transports: Record<string, StreamableHTTPServerTransport> = {};

  /** The app config */
  protected config: AppConfig;

  /** The logger instance */
  protected logger: Logger;

  /**
   * Creates a new HttpTransportManager instance.
   * @param allowedHosts - Array of allowed host names for DNS rebinding protection
   * @param allowedOrigins - Array of allowed origins for CORS protection
   */
  constructor(logger: Logger, config: AppConfig) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Creates a new StreamableHTTPServerTransport instance with configured security settings.
   *
   * Automatically registers the transport when a session is initialized,
   * and removes the transport when the session is closed.
   * @returns A new StreamableHTTPServerTransport instance
   */
  create(): StreamableHTTPServerTransport {
    // Build dynamic allowed origins that include the server's own origin
    const serverHttpOrigin = `http://${this.config.hostname}:${this.config.port}`;
    const serverHttpsOrigin = `https://${this.config.hostname}:${this.config.port}`;

    const dynamicAllowedOrigins = [
      ...new Set([
        ...this.config.allowedOrigins,
        serverHttpOrigin,
        serverHttpsOrigin,
      ]),
    ];

    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.#transports[sessionId] = transport;
      },
      onsessionclosed: (sessionId) => {
        delete this.#transports[sessionId];
      },
      enableJsonResponse: true,
      eventStore: new InMemoryEventStore(),
      enableDnsRebindingProtection: !this.config.noDnsRebinding,
      allowedHosts: [...new Set(this.config.allowedHosts)],
      allowedOrigins: dynamicAllowedOrigins,
    });

    return transport;
  }

  /**
   * Destroys a transport by session ID, properly closing the connection.
   * @param sessionId - The session ID of the transport to destroy
   */
  async destroy(sessionId: string): Promise<void> {
    const transport = this.#transports[sessionId];
    if (!transport) return;

    try {
      await transport.close();
    } finally {
      delete this.#transports[sessionId];
    }
  }

  /** Checks if a transport exists for the given session ID. */
  has(sessionId: string): boolean {
    return sessionId in this.#transports;
  }

  /** Retrieves a transport by session ID. */
  get(sessionId: string | undefined): StreamableHTTPServerTransport | undefined {
    return sessionId ? this.#transports[sessionId] : undefined;
  }

  protected async closeAll(): Promise<{ closed: number; errors: number }> {
    let closed = 0;
    let errors = 0;

    const closeTransport = async (transport: StreamableHTTPServerTransport) => {
      try {
        await transport.close();
        closed++;
      } catch (error) {
        this.logger.error({
          data: {
            error: "Error closing transport:",
            details: error,
          },
        });
        errors++;
      }
    };

    const transports = Object.values(this.#transports);
    this.#transports = {};
    await Promise.allSettled(transports.map(closeTransport));

    this.logger.info(`Closed ${closed} transports, ${errors} errors`);
    return { closed, errors };
  }

  /**
   * Gets the current number of active transports.
   * @returns The count of active transport connections
   */
  get count(): number {
    return Object.keys(this.#transports).length;
  }
}

/**
 * High-level HTTP server manager that orchestrates the Deno HTTP server and transport management.
 * Provides a unified interface for managing both the server lifecycle and transport connections.
 */
export class HttpServerManager extends HttpTransportManager {
  #fetch: Deno.ServeHandler | null = null;
  #server: Deno.HttpServer | null = null;
  #running = false;

  readonly enabled: boolean;

  constructor(config: AppConfig, logger: Logger) {
    super(logger, config);
    this.enabled = !config.noHttp;
  }

  /**
   * Sets the fetch handler for the HTTP server.
   * Can only be set when the server is not running.
   * @param fetch - The Deno serve handler function to handle HTTP requests
   * @example `setFetch(app.fetch)`
   */
  setFetch(fetch: Deno.ServeHandler): void {
    if (!this.#running) {
      this.#fetch = fetch;
    }
  }

  /**
   * Starts the HTTP server if enabled and not already running.
   *
   * Requires a fetch handler to be set before starting. @see setFetch
   * @note Will not throw but will silently return if conditions aren't met
   */
  async start(): Promise<void> {
    if (!this.enabled || this.#running || !this.#fetch) return;
    const { hostname, port } = this.config;
    this.#server = Deno.serve({
      hostname,
      port,
      onListen: () => this.logger.info(`${APP_NAME} listening on ${hostname}:${port}`),
    }, this.#fetch);
    this.#running = true;
  }

  /** Stops the HTTP server and closes all active transports. */
  async stop(): Promise<void> {
    if (!this.#running) return;
    await this.closeAll();
    await this.#server?.shutdown();
    this.#server = null;
    this.#running = false;
  }

  /**
   * Checks if the HTTP server is currently running.
   * @returns True if the server is running, false otherwise
   */
  get isRunning(): boolean {
    return this.#running;
  }
}
