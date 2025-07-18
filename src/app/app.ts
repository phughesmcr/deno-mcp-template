/**
 * @description Simple application orchestrator following Single Responsibility Principle
 * @module
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import type { Config } from "./config.ts";
import type { HttpServerManager } from "./http/manager.ts";
import { createHttpServer } from "./http/server.ts";
import { Logger } from "./logger.ts";
import { SignalHandler } from "./signals.ts";
import { StdioTransportManager } from "./stdio.ts";

export class App {
  #running = false;

  #http: HttpServerManager;
  #stdio: StdioTransportManager;

  readonly config: Config;
  readonly log: Logger;

  constructor(mcp: Server, config: Config) {
    this.config = config;
    this.log = new Logger(mcp, config.log.level);
    this.#http = createHttpServer(mcp, config, this.log);
    this.#stdio = new StdioTransportManager(mcp, config, this.log);

    // Handle shutdown signals gracefully
    new SignalHandler(this.log, () => this.stop());
  }

  get running(): boolean {
    return this.#running;
  }

  /** Start all services */
  async start(): Promise<void> {
    if (this.#running) return;
    if (this.#stdio.enabled) await this.#stdio.start();
    if (this.#http.enabled) await this.#http.start();
    this.#running = true;
  }

  /** Stop all services gracefully */
  async stop(): Promise<void> {
    if (!this.#running) return;
    await this.#stdio.stop();
    await this.#http.stop();
    this.#running = false;
  }
}
