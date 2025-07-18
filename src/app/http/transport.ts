import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { InMemoryEventStore } from "$/app/http/inMemoryEventStore.ts";
import type { Logger } from "$/app/logger.ts";
import type { Config } from "../config.ts";

/**
 * Manages transport lifecycle with proper error handling.
 * Single Responsibility: Transport registration, tracking, and cleanup.
 */
export class TransportRegistry {
  #transports = new Map<string, StreamableHTTPServerTransport>();
  #logger: Logger;
  #config: Config;

  constructor(config: Config, logger: Logger) {
    this.#logger = logger;
    this.#config = config;
  }

  create(): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.register(sessionId, transport);
      },
      onsessionclosed: (sessionId) => {
        this.unregister(sessionId);
      },
      enableJsonResponse: true,
      eventStore: new InMemoryEventStore(),
      enableDnsRebindingProtection: !this.#config.http.noDnsRebinding,
      allowedHosts: this.#config.http.allowedHosts,
      allowedOrigins: this.#config.http.allowedOrigins,
    });

    return transport;
  }

  register(sessionId: string, transport: StreamableHTTPServerTransport): void {
    if (this.#transports.has(sessionId)) {
      if (this.#transports.get(sessionId) === transport) {
        this.#logger.debug({
          logger: "TransportRegistry",
          data: `Transport for session ${sessionId} already registered`,
        });
        return;
      } else {
        this.#logger.error({
          logger: "TransportRegistry",
          data: `Transport for session ${sessionId} already registered with different transport`,
        });
        throw new Error(
          `Transport for session ${sessionId} already registered with different transport`,
        );
      }
    }
    this.#transports.set(sessionId, transport);
    this.#logger.debug({
      logger: "TransportRegistry",
      data: `Registered transport for session ${sessionId}`,
    });
  }

  unregister(sessionId: string): void {
    if (this.#transports.delete(sessionId)) {
      this.#logger.debug({
        logger: "TransportRegistry",
        data: `Unregistered transport for session ${sessionId}`,
      });
    }
  }

  get(sessionId: string): StreamableHTTPServerTransport | undefined {
    return this.#transports.get(sessionId);
  }

  has(sessionId: string): boolean {
    return this.#transports.has(sessionId);
  }

  getCount(): number {
    return this.#transports.size;
  }

  getAllSessionIds(): string[] {
    return Array.from(this.#transports.keys());
  }

  async destroyTransport(sessionId: string): Promise<void> {
    const transport = this.#transports.get(sessionId);
    if (!transport) return;

    try {
      await transport.close();
    } catch (error) {
      this.#logger.error({
        logger: "TransportRegistry",
        data: {
          error: `Error closing transport for session ${sessionId}:`,
          details: error,
        },
      });
    } finally {
      this.unregister(sessionId);
    }
  }

  async destroyAll(): Promise<{ closed: number; errors: Error[] }> {
    let closed = 0;
    const errors: Error[] = [];

    const destroyPromises = Array.from(this.#transports.entries()).map(
      async ([, transport]) => {
        try {
          await transport.close();
          closed++;
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      },
    );

    this.#transports.clear();
    await Promise.allSettled(destroyPromises);

    this.#logger.debug({
      logger: "TransportRegistry",
      data: `Cleanup completed: ${closed} closed, ${errors.length} errors`,
    });

    return { closed, errors };
  }
}
