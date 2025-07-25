import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { AppConfig } from "$/shared/types.ts";
import type { Logger } from "./logger.ts";

export class StdioTransportManager {
  #transport: StdioServerTransport | null = null;
  #log: Logger;

  readonly enabled: boolean;

  constructor(configuration: AppConfig["stdio"], logger: Logger) {
    this.enabled = configuration.enabled;
    this.#log = logger;
  }

  get isRunning(): boolean {
    return !!this.#transport;
  }

  get transport(): StdioServerTransport | null {
    return this.#transport;
  }

  async acquire(): Promise<StdioServerTransport> {
    if (!this.enabled) throw new Error("STDIO transport is disabled");
    if (this.#transport) return this.#transport;
    this.#transport = new StdioServerTransport();
    this.#log.debug({ data: "STDIO transport acquired" });
    return this.#transport;
  }

  async release(): Promise<void> {
    if (!this.#transport) return;
    try {
      await this.#transport.close();
    } finally {
      this.#transport = null;
      this.#log.debug({ data: "STDIO transport released" });
    }
  }
}
