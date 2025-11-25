import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { APP_NAME } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";
import { getRejected } from "$/shared/utils.ts";
import { createHttpServer } from "./http/mod.ts";
import { setupSignalHandlers } from "./signals.ts";
import { createStdioManager } from "./stdio.ts";

export interface App {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
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
  let lastError: Error | null = null;
  let startInProgress: Promise<void> | null = null;
  let stopInProgress: Promise<void> | null = null;

  const start = async (): Promise<void> => {
    if (isRunning) return;
    if (startInProgress) return await startInProgress;
    if (stopInProgress) await stopInProgress;

    startInProgress = (async () => {
      lastError = null;
      try {
        console.error(`${APP_NAME} starting...`);
        const results = await Promise.allSettled([
          stdio.connect(),
          http.connect(),
        ]);
        lastError = getRejected(results);
        if (lastError) throw lastError;
        isRunning = true;
      } catch (err) {
        console.error(`${APP_NAME} starting failed. Rolling back...`);
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;
        isRunning = false;
        await Promise.allSettled([
          stdio.disconnect(),
          http.disconnect(),
        ]);
        throw lastError;
      } finally {
        startInProgress = null;
      }
    })();

    return await startInProgress;
  };

  const stop = async (): Promise<void> => {
    if (startInProgress) await startInProgress.catch(() => {});
    if (!isRunning) return;
    if (stopInProgress) return stopInProgress;

    stopInProgress = (async () => {
      const results = await Promise.allSettled([
        stdio.disconnect(),
        http.disconnect(),
      ]);
      isRunning = false;
      lastError = getRejected(results);
      if (lastError) {
        console.error(`${APP_NAME} stop encountered errors`);
        throw lastError;
      }
    })();

    try {
      console.error(`${APP_NAME} stopping...`);
      await stopInProgress;
    } finally {
      stopInProgress = null;
    }
  };

  setupSignalHandlers(stop);

  return {
    start,
    stop,
    isRunning: () => isRunning,
  };
}
