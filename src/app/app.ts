import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppConfig } from "$/shared/types.ts";
import { createHttpServer } from "./http/mod.ts";
import { setupSignalHandlers } from "./signals.ts";
import { createStdioManager } from "./stdio.ts";

export interface App {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  hasError: () => Error | null;
}

/**
 * Creates the main application instance with STDIO and HTTP transports
 * @param mcp - The MCP server instance
 * @param config - The application configuration
 * @returns The application instance with start/stop methods
 */
export function createApp(mcp: McpServer, config: AppConfig): App {
  const stdio = createStdioManager(mcp, config.stdio);
  const http = createHttpServer(mcp, config.http);

  let isRunning = false;
  let hasError: Error | null = null;

  const start = async () => {
    if (isRunning) return;
    hasError = null;
    await Promise.all([
      stdio.connect(),
      http.connect(),
    ]).catch((error) => {
      hasError = error;
    }).finally(() => {
      isRunning = true;
      if (hasError) throw hasError;
    });
  };

  const stop = async () => {
    if (!isRunning) return;
    hasError = null;
    await Promise.all([
      stdio.disconnect(),
      http.disconnect(),
    ]).catch((error) => {
      hasError = error;
    }).finally(() => {
      isRunning = false;
      if (hasError) throw hasError;
    });
  };

  setupSignalHandlers(stop);

  return {
    start,
    stop,
    isRunning: () => isRunning,
    hasError: () => hasError,
  };
}
