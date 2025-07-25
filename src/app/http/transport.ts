import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { InMemoryEventStore } from "$/app/http/inMemoryEventStore.ts";
import type { Logger } from "$/app/logger.ts";
import { APP_NAME } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";

export class HttpServerManager {
  readonly transports: HttpTransportManager;

  readonly config: Readonly<AppConfig["http"]>;
  #running: boolean;

  #logger: Logger;

  #server: Deno.HttpServer | null = null;
  #fetch: Deno.ServeHandler<Deno.NetAddr> | null = null;

  constructor(config: AppConfig["http"], logger: Logger) {
    this.transports = new HttpTransportManager(config, logger);
    this.config = config;
    this.#running = false;
    this.#logger = logger;
    this.#fetch = null;
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  set fetch(fetch: Deno.ServeHandler<Deno.NetAddr>) {
    if (this.#running) {
      throw new Error("Cannot set fetch after server is running");
    }
    this.#fetch = fetch;
  }

  /** Starts the HTTP server */
  async start(): Promise<void> {
    if (!this.isEnabled || this.#running || !this.#fetch) return;
    const { hostname, port } = this.config;
    this.#server = Deno.serve({
      hostname,
      port,
      onListen: () => {
        this.#logger.info({
          data: { message: `${APP_NAME} listening on ${hostname}:${port}` },
        });
      },
    }, this.#fetch);
    this.#running = true;
  }

  /** Stops the HTTP server and cleans up all transports */
  async stop(): Promise<void> {
    if (!this.#running) return;
    await this.transports.releaseAll();
    await this.#server?.shutdown();
    this.#server = null;
    this.#running = false;
  }
}

export class HttpTransportManager {
  #config: AppConfig["http"];
  #transports: Map<string, StreamableHTTPServerTransport>;
  #logger: Logger;

  constructor(config: AppConfig["http"], logger: Logger) {
    this.#config = config;
    this.#transports = new Map();
    this.#logger = logger;
  }

  get count(): number {
    return this.#transports.size;
  }

  get(sessionId: string): StreamableHTTPServerTransport | undefined {
    return this.#transports.get(sessionId);
  }

  #create(sessionId?: string): StreamableHTTPServerTransport {
    const sessionKey = sessionId ?? crypto.randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionKey,
      onsessioninitialized: (id) => {
        if (!this.#transports.has(id)) {
          this.#transports.set(id, transport);
          this.#logger.debug({
            data: { message: "Session initialized", sessionId: id },
          });
        }
      },
      onsessionclosed: (id) => {
        this.#transports.delete(id);
        this.#logger.debug({
          data: { message: "Session closed", sessionId: id },
        });
      },
      enableJsonResponse: true,
      eventStore: new InMemoryEventStore(),
      enableDnsRebindingProtection: !!this.#config.enableDnsRebinding,
      allowedHosts: this.#config.allowedHosts ?? [],
      allowedOrigins: this.#config.allowedOrigins ?? [],
    });

    // Store the transport immediately with the session key for quick lookup
    if (sessionKey) {
      this.#transports.set(sessionKey, transport);
    }

    return transport;
  }

  #validateInitRequest(sessionId: string | undefined, requestBody: string): unknown {
    if (requestBody.length === 0) throw new Error("Empty request body");

    let jsonBody;
    try {
      jsonBody = JSON.parse(requestBody);
    } catch {
      throw new Error("Invalid JSON in request body");
    }

    if (!isInitializeRequest(jsonBody)) {
      if (!sessionId) {
        throw new Error("No valid session ID provided");
      }
      throw new Error(`No transport found for session ID: ${sessionId}`);
    }

    return jsonBody;
  }

  acquire(sessionId: string | undefined, requestBody: string): StreamableHTTPServerTransport {
    if (sessionId) {
      const transport = this.#transports.get(sessionId);
      if (transport) return transport;
    }
    this.#validateInitRequest(sessionId, requestBody);
    const sessionKey = sessionId ?? crypto.randomUUID();
    return this.#create(sessionKey);
  }

  async release(sessionId: string): Promise<void> {
    const transport = this.#transports.get(sessionId);
    if (!transport) {
      throw new Error(`Transport not found for session ${sessionId}`);
    }
    await transport.close();
    this.#transports.delete(sessionId);
  }

  async releaseAll(): Promise<void> {
    const promises = Array.from(this.#transports.values()).map((transport) => transport.close());
    await Promise.allSettled(promises);
    this.#transports.clear();
  }
}
