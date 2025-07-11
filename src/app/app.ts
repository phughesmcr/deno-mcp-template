/**
 * @description Simple application orchestrator following Single Responsibility Principle
 * @module
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import { parseConfig } from "$/app/config.ts";
import type { AppConfig } from "$/types.ts";
import type { HttpServerManager } from "./http/manager.ts";
import { createHttpServer } from "./http/server.ts";
import { Logger } from "./logger.ts";
import { SignalHandler } from "./signals.ts";
import { StdioTransportManager } from "./stdio.ts";

class Application {
  #running = false;
  #http: HttpServerManager;
  #stdio: StdioTransportManager;

  readonly config: Readonly<AppConfig>;
  readonly log: Logger;

  constructor(
    logger: Logger,
    http: HttpServerManager,
    stdio: StdioTransportManager,
    config: AppConfig,
  ) {
    this.config = config;
    this.log = logger;
    this.#http = http;
    this.#stdio = stdio;
  }

  /** Start all services */
  async start(): Promise<void> {
    if (this.#running) return;
    if (!this.config.noStdio) await this.#stdio.start();
    if (!this.config.noHttp) await this.#http.start();
    this.#running = true;
  }

  /** Stop all services gracefully */
  async stop(): Promise<void> {
    if (!this.#running) return;
    await this.#stdio.stop();
    await this.#http.stop();
    this.#running = false;
  }

  get isRunning(): boolean {
    return this.#running;
  }
}

/**
 * Factory function for creating an Application instance with dependency injection
 * @param server - The MCP server
 * @returns The Application instance
 */
export function createApp(server: Server): Application {
  // Load configuration
  const config: AppConfig = parseConfig();

  // logger is a wrapper for console.error
  const logger = new Logger(server, config.log);

  // Create HTTP server manager
  const http: HttpServerManager = createHttpServer(server, config, logger);

  // Create STDIO transport manager
  const stdio = new StdioTransportManager(server, config, logger);

  // Create application instance
  const app = new Application(logger, http, stdio, config);

  // Handle shutdown signals gracefully
  new SignalHandler(logger, () => app.stop());

  return app;
}

export type { Application };
