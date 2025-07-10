import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { APP_NAME } from "$/constants.ts";
import type { AppConfig } from "$/types.ts";

export class StdioTransportManager {
  #mcp: Server;
  #transport: StdioServerTransport | null = null;
  #enabled: boolean;

  constructor(mcp: Server, config: AppConfig) {
    this.#mcp = mcp;
    this.#enabled = !config.noStdio;
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
      console.error(`${APP_NAME} listening on STDIO`);
    } catch (error) {
      console.error(`Error starting ${APP_NAME} STDIO transport:`, error);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    try {
      await this.#transport?.close();
      console.error(`${APP_NAME} STDIO transport closed`);
    } catch (error) {
      console.error(`Error closing ${APP_NAME} STDIO transport:`, error);
    } finally {
      this.#transport = null;
    }
  }
}
