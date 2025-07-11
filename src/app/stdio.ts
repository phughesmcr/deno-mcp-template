import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { APP_NAME } from "$/constants.ts";
import type { AppConfig } from "$/types.ts";
import type { Logger } from "./logger.ts";

export class StdioTransportManager {
  #mcp: Server;
  #transport: StdioServerTransport | null = null;
  #enabled: boolean;
  #logger: Logger;

  constructor(mcp: Server, config: AppConfig, logger: Logger) {
    this.#mcp = mcp;
    this.#enabled = !config.noStdio;
    this.#logger = logger;
  }

  get isRunning(): boolean {
    return !!this.#transport;
  }

  get transport(): StdioServerTransport | null {
    return this.#transport;
  }

  async start(): Promise<void> {
    if (!this.#enabled || this.isRunning) return;
    try {
      this.#transport = new StdioServerTransport();
      await this.#mcp.connect(this.#transport);
      this.#logger.info(`${APP_NAME} listening on STDIO`);
    } catch (error) {
      this.#logger.error({
        data: {
          error: `Error starting ${APP_NAME} STDIO transport:`,
          details: error,
        },
      });
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    try {
      await this.#transport?.close();
      this.#logger.info(`${APP_NAME} STDIO transport closed`);
    } catch (error) {
      this.#logger.error({
        data: {
          error: `Error closing ${APP_NAME} STDIO transport:`,
          details: error,
        },
      });
    } finally {
      this.#transport = null;
    }
  }
}
