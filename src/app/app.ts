/**
 * @description Simple application orchestrator following Single Responsibility Principle
 * @module
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import type { AppConfig } from "$/shared/types.ts";
import { createHttpServer } from "./http/server.ts";
import { Logger } from "./logger.ts";
import { setupSignalHandlers } from "./signals.ts";
import { StdioTransportManager } from "./stdio.ts";

export async function createApp(mcp: Server, config: AppConfig) {
  const log = new Logger(mcp, config.log.level);
  const stdio = new StdioTransportManager(config.stdio, log);
  const http = createHttpServer(mcp, config, log);

  const start = async () => {
    if (config.stdio.enabled) {
      const transport = await stdio.acquire();
      await mcp.connect(transport);
      log.info({ data: { message: `Listening on STDIO` } });
    }
    if (config.http.enabled) {
      await http.start();
    }
  };

  const stop = async () => {
    if (config.stdio.enabled) {
      await stdio.release();
      log.debug({ data: { message: "STDIO transport released" } });
    }
    if (config.http.enabled) {
      await http.stop();
      log.debug({ data: { message: "HTTP server stopped" } });
    }
  };

  setupSignalHandlers(stop, log);

  return { start, stop, log };
}
