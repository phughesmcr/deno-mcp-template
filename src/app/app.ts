/**
 * @description Simple application orchestrator following Single Responsibility Principle
 * @module
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { APP_NAME } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";
import { createHttpServer } from "./http/server.ts";
import { setupSignalHandlers } from "./signals.ts";
import { StdioTransportManager } from "./stdio.ts";

export async function createApp(mcp: McpServer, config: AppConfig) {
  const stdio = new StdioTransportManager(config.stdio);
  const http = createHttpServer(mcp, config);

  const start = async () => {
    // Connect to STDIO transport
    if (config.stdio.enabled) {
      const transport = await stdio.acquire();
      await mcp.connect(transport);
      console.error(`${APP_NAME} listening to STDIO`);
    }
    // Start HTTP server
    if (config.http.enabled) {
      await http.start();
    }
  };

  const stop = async () => {
    // Release STDIO transport
    if (config.stdio.enabled) {
      await stdio.release();
    }
    // Stop HTTP server
    if (config.http.enabled) {
      await http.stop();
    }
  };

  setupSignalHandlers(stop);

  return { start, stop };
}
