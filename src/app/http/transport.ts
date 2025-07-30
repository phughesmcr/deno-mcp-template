import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { KvEventStore } from "$/app/http/kvEventStore.ts";
import { APP_NAME } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";

export class HttpServerManager {
  readonly transports: HttpTransportManager;

  readonly config: Readonly<AppConfig["http"]>;
  #running: boolean;

  #server: Deno.HttpServer | null = null;
  #fetch: Deno.ServeHandler<Deno.NetAddr> | null = null;

  constructor(config: AppConfig["http"]) {
    this.transports = new HttpTransportManager(config);
    this.config = config;
    this.#running = false;
    this.#fetch = null;
  }

  get enabled(): boolean {
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
    if (!this.enabled || this.#running || !this.#fetch) return;
    const { hostname, port } = this.config;
    this.#server = Deno.serve({
      hostname,
      port,
      onListen: () => {
        console.error(`${APP_NAME} listening on ${hostname}:${port}`);
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

  constructor(config: AppConfig["http"]) {
    this.#config = config;
    this.#transports = new Map();
  }

  get count(): number {
    return this.#transports.size;
  }

  get(sessionId: string): StreamableHTTPServerTransport | undefined {
    return this.#transports.get(sessionId);
  }

  async #create(sessionId?: string): Promise<StreamableHTTPServerTransport> {
    const sessionKey = sessionId ?? crypto.randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionKey,
      onsessioninitialized: (id) => {
        if (!this.#transports.has(id)) {
          this.#transports.set(id, transport);
        }
      },
      onsessionclosed: (id) => {
        this.#transports.delete(id);
      },
      enableJsonResponse: true,
      eventStore: await KvEventStore.create(),
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

  async acquire(
    sessionId: string | undefined,
    requestBody: string,
  ): Promise<StreamableHTTPServerTransport> {
    if (sessionId) {
      const transport = this.#transports.get(sessionId);
      if (transport) return transport;
    }
    this.#validateInitRequest(sessionId, requestBody);
    const sessionKey = sessionId ?? crypto.randomUUID();
    const transport = await this.#create(sessionKey);
    return transport;
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
