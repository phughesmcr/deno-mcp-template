/**
 * @description Simple application orchestrator following Single Responsibility Principle
 * @module
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Hono } from "hono";

import type { AppConfig } from "../types.ts";
import { parseConfig } from "./config.ts";
import { createHttpServer } from "./httpServer.ts";
import { Logger } from "./logger.ts";
import { SignalHandler } from "./signals.ts";
import { TransportManager } from "./transports.ts";

export class Application extends Logger {
  #running = false;

  readonly transports: TransportManager;
  readonly config: AppConfig;

  constructor(
    mcp: Server,
    transports: TransportManager,
    config: AppConfig,
  ) {
    super(mcp, config.log);
    this.transports = transports;
    this.config = config;
  }

  /** Start all services */
  async start(): Promise<void> {
    if (this.#running) return;
    await this.transports.stdio.start();
    await this.transports.http.start();
    this.#running = true;
  }

  /** Stop all services gracefully */
  async stop(): Promise<void> {
    if (!this.#running) return;
    await this.transports.stdio.stop();
    await this.transports.http.stop();
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

  // Create STDIO and HTTP transport manager
  const transports = new TransportManager(server, config);

  // Create Hono HTTP server
  const http: Hono = createHttpServer(server, transports, config);

  // Set the fetch handler for the HTTP transport manager (called by Deno.serve)
  transports.http.setFetch(http.fetch.bind(http));

  // Create application instance
  const app = new Application(server, transports, config);

  // Create signal handler with app's shutdown method
  new SignalHandler(() => app.stop());

  return app;
}
