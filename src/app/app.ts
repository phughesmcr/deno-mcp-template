/**
 * @description Simple application orchestrator following Single Responsibility Principle
 * @module
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import type { AppConfig } from "../types.ts";
import { parseConfig } from "./config.ts";
import type { HttpServerManager } from "./http/manager.ts";
import { createHttpServer } from "./http/server.ts";
import { Logger } from "./logger.ts";
import { SignalHandler } from "./signals.ts";
import { StdioTransportManager } from "./stdio.ts";

class Application extends Logger {
  #running = false;
  #http: HttpServerManager;
  #stdio: StdioTransportManager;

  readonly config: Readonly<AppConfig>;

  constructor(
    mcp: Server,
    http: HttpServerManager,
    stdio: StdioTransportManager,
    config: AppConfig,
  ) {
    super(mcp, config.log);
    this.config = config;
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

  // Create HTTP transport manager
  const http: HttpServerManager = createHttpServer(server, config);

  // Create STDIO transport manager
  const stdio = new StdioTransportManager(server, config);

  // Create application instance
  const app = new Application(server, http, stdio, config);

  // Handle shutdown signals gracefully
  new SignalHandler(() => app.stop());

  return app;
}

export type { Application };
