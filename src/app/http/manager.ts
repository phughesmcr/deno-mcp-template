import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { APP_NAME } from "../../constants.ts";
import type { AppConfig } from "../../types.ts";
import { InMemoryEventStore } from "../inMemoryEventStore.ts";

class HttpTransportManager {
  #transports: Record<string, StreamableHTTPServerTransport> = {};
  #allowedHosts: string[];
  #allowedOrigins: string[];

  constructor(allowedHosts: string[], allowedOrigins: string[]) {
    this.#allowedHosts = allowedHosts;
    this.#allowedOrigins = allowedOrigins;
  }

  create(): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sessionId) => this.#transports[sessionId] = transport,
      enableJsonResponse: true,
      eventStore: new InMemoryEventStore(),
      enableDnsRebindingProtection: true,
      allowedHosts: this.#allowedHosts, // removable if enableDnsRebindingProtection is false
      allowedOrigins: this.#allowedOrigins, // removable if enableDnsRebindingProtection is false
    });

    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId && this.#transports[sessionId] === transport) {
        delete this.#transports[sessionId];
      }
    };

    return transport;
  }

  async destroy(sessionId: string): Promise<void> {
    const transport = this.#transports[sessionId];
    if (transport) {
      try {
        await transport.close();
      } finally {
        delete this.#transports[sessionId];
      }
    }
  }

  has(sessionId: string): boolean {
    return sessionId in this.#transports;
  }

  get(sessionId: string | undefined): StreamableHTTPServerTransport | undefined {
    return sessionId ? this.#transports[sessionId] : undefined;
  }

  set(sessionId: string, transport: StreamableHTTPServerTransport): void {
    this.#transports[sessionId] = transport;
  }

  async closeAll(): Promise<{ closed: number; errors: number }> {
    let closed = 0;
    let errors = 0;

    const closeTransport = async (transport: StreamableHTTPServerTransport) => {
      try {
        await transport?.close();
        closed++;
      } catch (error) {
        console.error("Error closing transport:", error);
        errors++;
      }
    };

    await Promise.allSettled(Object.values(this.#transports).map(closeTransport));
    this.#transports = {};

    console.error(`Closed ${closed} transports, ${errors} errors`);
    return { closed, errors };
  }

  get count(): number {
    return Object.keys(this.#transports).length;
  }
}

export class HttpServerManager {
  #transports: HttpTransportManager;
  #fetch: Deno.ServeHandler | null = null;
  #config: AppConfig;
  #server: Deno.HttpServer | null = null;
  #running = false;

  readonly enabled: boolean;

  // Delegated transport methods
  create: () => StreamableHTTPServerTransport;
  destroy: (sessionId: string) => Promise<void>;
  has: (sessionId: string) => boolean;
  get: (sessionId: string | undefined) => StreamableHTTPServerTransport | undefined;
  set: (sessionId: string, transport: StreamableHTTPServerTransport) => void;

  constructor(config: AppConfig) {
    this.#config = config;
    this.#transports = new HttpTransportManager(config.allowedHosts, config.allowedOrigins);
    this.enabled = !config.noHttp;
    this.create = this.#transports.create.bind(this.#transports);
    this.destroy = this.#transports.destroy.bind(this.#transports);
    this.has = this.#transports.has.bind(this.#transports);
    this.get = this.#transports.get.bind(this.#transports);
    this.set = this.#transports.set.bind(this.#transports);
  }

  get count(): number {
    return this.#transports.count;
  }

  setFetch(fetch: Deno.ServeHandler): void {
    if (!this.#running) {
      this.#fetch = fetch;
    }
  }

  async start(): Promise<void> {
    if (this.#running || !this.#fetch || !this.enabled) return;
    const { hostname, port } = this.#config;
    this.#server = Deno.serve({
      hostname,
      port,
      onListen: () => console.error(`${APP_NAME} listening on ${hostname}:${port}`),
    }, this.#fetch);
    this.#running = true;
  }

  async stop(): Promise<void> {
    if (!this.#running || !this.#server) return;
    await this.#transports.closeAll();
    await this.#server.shutdown();
    this.#server = null;
    this.#running = false;
  }

  get isRunning(): boolean {
    return this.#running;
  }
}
