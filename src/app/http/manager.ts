import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { APP_NAME } from "$/constants";
import type { Config } from "../config.ts";
import type { Logger } from "../logger.ts";
import { TransportRegistry } from "./transport.ts";

export class HttpServerManager {
  #config: Config;
  #fetch: Deno.ServeHandler | null = null;
  #logger: Logger;
  #running = false;
  #server: Deno.HttpServer | null = null;
  #transportRegistry: TransportRegistry;

  constructor(config: Config, logger: Logger) {
    this.#config = config;
    this.#logger = logger;
    this.#transportRegistry = new TransportRegistry(config, logger);
  }

  /** Gets the current number of active transports */
  get count(): number {
    return this.#transportRegistry.getCount();
  }

  /** Is the HTTP server enabled? */
  get enabled(): boolean {
    return this.#config.http.enabled;
  }

  /** Is the HTTP server running? */
  get running(): boolean {
    return this.#running;
  }

  /** Creates a new transport using the factory */
  create(): StreamableHTTPServerTransport {
    return this.#transportRegistry.create();
  }

  /** Destroys a transport by session ID */
  async destroy(sessionId: string): Promise<void> {
    if (!this.#transportRegistry.has(sessionId)) {
      throw new Error(`Transport not found for session ${sessionId}`);
    }
    return this.#transportRegistry.destroyTransport(sessionId);
  }

  /** Retrieves a transport by session ID */
  get(sessionId: string | undefined): StreamableHTTPServerTransport | undefined {
    return sessionId ? this.#transportRegistry.get(sessionId) : undefined;
  }

  /** Checks if a transport exists for the given session ID */
  has(sessionId: string): boolean {
    return this.#transportRegistry.has(sessionId);
  }

  /** Sets the fetch handler for the HTTP server */
  setFetch(fetch: Deno.ServeHandler): void {
    if (!this.#running) {
      this.#fetch = fetch;
    }
  }

  /** Starts the HTTP server */
  async start(): Promise<void> {
    if (!this.enabled || this.#running || !this.#fetch) return;
    const { hostname, port } = this.#config.http;
    this.#server = Deno.serve({
      hostname,
      port,
      onListen: () =>
        this.#logger.info({
          logger: "HttpServerManager",
          data: `${APP_NAME} listening on ${hostname}:${port}`,
        }),
    }, this.#fetch);
    this.#running = true;
  }

  /** Stops the HTTP server and cleans up all transports */
  async stop(): Promise<void> {
    if (!this.#running) return;

    const { errors } = await this.#transportRegistry.destroyAll();
    if (errors.length > 0) {
      this.#logger.error({
        logger: "HttpServerManager",
        data: `${errors.length} errors during transport cleanup`,
      });
    }

    await this.#server?.shutdown();
    this.#server = null;
    this.#running = false;
  }
}
