import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { APP_NAME } from "../constants.ts";
import type { AppConfig } from "../types.ts";
import { InMemoryEventStore } from "./inMemoryEventStore.ts";

class StdioTransportManager {
  #server: Server;
  #stdioTransport: StdioServerTransport | null = null;
  #running = false;

  constructor(server: Server) {
    this.#server = server;
  }

  async start(): Promise<void> {
    if (this.#running) return;

    this.#stdioTransport = new StdioServerTransport();
    await this.#server.connect(this.#stdioTransport);
    console.error(`${APP_NAME} listening on STDIO`);
    this.#running = true;
  }

  async stop(): Promise<void> {
    if (!this.#running || !this.#stdioTransport) return;
    try {
      await this.#stdioTransport.close();
      console.error(`${APP_NAME} STDIO transport closed`);
    } catch (error) {
      console.error(`Error closing ${APP_NAME} STDIO transport:`, error);
    } finally {
      this.#stdioTransport = null;
      this.#running = false;
    }
  }

  get isRunning(): boolean {
    return this.#running;
  }
}

class HttpTransportManager {
  #transports: Record<string, StreamableHTTPServerTransport> = {};
  #allowedHosts: string[];
  #allowedOrigins: string[];

  constructor(allowedHosts: string[], allowedOrigins: string[]) {
    this.#allowedHosts = allowedHosts;
    this.#allowedOrigins = allowedOrigins;
  }

  create(): StreamableHTTPServerTransport {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (actualSessionId) => this.#transports[actualSessionId] = transport,
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
    } catch (error) {
      console.error("Failed to create HTTP transport:", error);
      console.error("Allowed hosts:", this.#allowedHosts);
      console.error("Allowed origins:", this.#allowedOrigins);
      throw error;
    }
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
    if (!sessionId) return undefined;
    return this.#transports[sessionId];
  }

  set(sessionId: string, transport: StreamableHTTPServerTransport) {
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

    console.error(`Closed ${closed} transports, ${errors} errors`);
    return { closed, errors };
  }

  get count(): number {
    return Object.keys(this.#transports).length;
  }
}

/** Manages the HTTP server lifecycle */
class HttpServerManager extends HttpTransportManager {
  #fetch: Deno.ServeHandler | null = null;
  #config: AppConfig;
  #server: Deno.HttpServer | null = null;
  #running = false;

  constructor(config: AppConfig) {
    super(config.allowedHosts, config.allowedOrigins);
    this.#config = config;
  }

  setFetch(fetch: Deno.ServeHandler) {
    if (this.#running) return;
    this.#fetch = fetch;
  }

  async start(): Promise<void> {
    if (this.#running || !this.#fetch) return;
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
    await this.closeAll();
    await this.#server.shutdown();
    this.#server = null;
    this.#running = false;
  }

  get isRunning(): boolean {
    return this.#running;
  }
}

export class TransportManager {
  readonly http: HttpServerManager;
  readonly stdio: StdioTransportManager;

  constructor(server: Server, config: AppConfig) {
    this.http = new HttpServerManager(config);
    this.stdio = new StdioTransportManager(server);
  }
}
