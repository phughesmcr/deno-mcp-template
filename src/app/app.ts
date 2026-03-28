import { closeKvStore, configureKvPath, openKvStore } from "$/kv/mod.ts";
import {
  createResourceSubscriptionTracker,
  type CreateTransportScopedMcpServer,
} from "$/mcp/context.ts";
import {
  migrateWorkingTaskIndexIfNeeded,
  startTaskQueueWorker,
  stopTaskQueueWorker,
} from "$/mcp/tasks/mod.ts";
import { APP_NAME } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";
import { getRejected } from "$/shared/utils.ts";
import { startMaintenanceCrons } from "./cron.ts";
import { createHttpServer } from "./http/mod.ts";
import { verifyRuntimePermissions } from "./permissions.ts";
import { setupSignalHandlers } from "./signals.ts";
import { createStdioManager } from "./stdio.ts";

export interface App {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
}

/**
 * Creates the main application instance with STDIO and HTTP transports.
 *
 * `createMcpServer` is a **transport-scoped factory**: it is invoked once for STDIO (one long-lived
 * MCP server) and once per streamable HTTP MCP session. Pass the same
 * `McpServerFactoryContext` (notably `subscriptions`) on every invocation so process-wide
 * state stays consistent.
 *
 * @param createMcpServer - Factory invoked per transport / HTTP session (see module docs above)
 * @param config - The application configuration
 */
export function createApp(createMcpServer: CreateTransportScopedMcpServer, config: AppConfig): App {
  configureKvPath(config.kv.path);
  const subscriptions = createResourceSubscriptionTracker();
  const ctx = { subscriptions };
  // MCP SDK v1.27+ allows one active transport per protocol instance.
  // Create one MCP server per transport so HTTP and STDIO can run together.
  const stdio = createStdioManager(createMcpServer(ctx), config.stdio);
  const http = createHttpServer(() => createMcpServer(ctx), config.http);

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
        await verifyRuntimePermissions(config);
        await openKvStore(config.kv.path);
        await migrateWorkingTaskIndexIfNeeded();
        startMaintenanceCrons();
        await startTaskQueueWorker();
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
        stopTaskQueueWorker();
        await Promise.allSettled([
          stdio.disconnect(),
          http.disconnect(),
          closeKvStore(),
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
    if (stopInProgress) return await stopInProgress;

    stopInProgress = (async () => {
      stopTaskQueueWorker();
      const results = await Promise.allSettled([
        stdio.disconnect(),
        http.disconnect(),
        closeKvStore(),
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
