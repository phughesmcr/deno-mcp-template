import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { APP_NAME } from "$/constants";
import type { Config } from "./config.ts";
import type { Logger } from "./logger.ts";

export class StdioTransportManager {
  #config: Config;
  #logger: Logger;
  #mcp: Server;
  #transport: StdioServerTransport | null = null;

  /**
   * Creates a new StdioTransportManager instance.
   * @param mcp - The MCP server instance
   * @param config - The application configuration
   * @param logger - The logger instance
   */
  constructor(mcp: Server, config: Config, logger: Logger) {
    this.#config = config;
    this.#logger = logger;
    this.#mcp = mcp;
  }

  get enabled(): boolean {
    return this.#config.stdio.enabled;
  }

  get running(): boolean {
    return !!this.#transport;
  }

  get transport(): StdioServerTransport | null {
    return this.#transport;
  }

  async start(): Promise<void> {
    if (!this.enabled || this.running) return;
    try {
      this.#transport = new StdioServerTransport();
      await this.#mcp.connect(this.#transport);
      this.#logger.info({
        logger: "StdioTransportManager",
        data: `${APP_NAME} listening on STDIO`,
      });
    } catch (error) {
      this.#logger.error({
        logger: "StdioTransportManager",
        data: {
          error: `Error starting ${APP_NAME} STDIO transport:`,
          details: error,
        },
      });
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    try {
      await this.#transport?.close();
      this.#logger.info({
        logger: "StdioTransportManager",
        data: `${APP_NAME} STDIO transport closed`,
      });
    } catch (error) {
      this.#logger.error({
        logger: "StdioTransportManager",
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
