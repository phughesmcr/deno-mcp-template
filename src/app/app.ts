import { getProcessKvRuntime } from "$/kv/mod.ts";
import type { KvRuntime } from "$/kv/runtime.ts";
import { createKvWatcher } from "$/kv/watch.ts";
import {
  createResourceSubscriptionTracker,
  type CreateTransportScopedMcpServer,
} from "$/mcp/context.ts";
import {
  runTaskStartupMaintenance,
  startTaskQueueWorker,
  stopTaskQueueWorker,
} from "$/mcp/tasks/mod.ts";
import { createUrlElicitationRegistry } from "$/mcp/urlElicitation/registry.ts";
import type { AppConfig, Transport } from "$/shared/config-types.ts";
import { APP_NAME } from "$/shared/constants.ts";
import { resolvePublicBaseUrl } from "$/shared/publicBaseUrl.ts";
import { getRejected } from "$/shared/utils.ts";
import { startMaintenanceCrons } from "./cron.ts";
import { createHttpServer } from "./http/mod.ts";
import { verifyRuntimePermissions as defaultVerifyRuntimePermissions } from "./permissions.ts";
import { setupSignalHandlers } from "./signals.ts";
import { createStdioManager } from "./stdio.ts";

export interface App {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
}

/** Optional seams for tests (isolated KV, fake transports, permission stub). */
export type CreateAppOptions = Readonly<{
  kv?: KvRuntime;
  stdio?: Transport;
  http?: Transport;
  verifyRuntimePermissions?: (config: AppConfig) => Promise<void>;
  /** @default true — set false in tests to avoid `Deno.cron` resource leaks. */
  enableMaintenanceCrons?: boolean;
}>;

/**
 * Creates the main application instance with STDIO and HTTP transports.
 *
 * `createMcpServer` is a **transport-scoped factory**: it is invoked once for STDIO (one long-lived
 * MCP server) and once per streamable HTTP MCP session. Pass the same
 * `McpServerFactoryContext` (`subscriptions`, `kv`, `urlElicitation`, `tasks`) on every invocation so
 * process-wide state stays consistent.
 *
 * @param createMcpServer - Factory invoked per transport / HTTP session (see module docs above)
 * @param config - The application configuration
 * @param options - Optional test / alternate wiring (see {@link CreateAppOptions}).
 */
export function createApp(
  createMcpServer: CreateTransportScopedMcpServer,
  config: AppConfig,
  options?: CreateAppOptions,
): App {
  const kvRuntime = options?.kv ?? getProcessKvRuntime();
  kvRuntime.configurePath(config.kv.path);
  const subscriptions = createResourceSubscriptionTracker(createKvWatcher(kvRuntime));
  const urlElicitationRegistry = createUrlElicitationRegistry();
  const ctx = {
    subscriptions,
    kv: kvRuntime,
    urlElicitation: {
      baseUrl: resolvePublicBaseUrl(config.http),
      registry: urlElicitationRegistry,
    },
    tasks: config.tasks,
  };
  // MCP SDK v1.27+ allows one active transport per protocol instance.
  // Create one MCP server per transport so HTTP and STDIO can run together.
  const stdio = options?.stdio ?? createStdioManager(createMcpServer(ctx), config.stdio);
  const http = options?.http ??
    createHttpServer(() => createMcpServer(ctx), config.http, {
      urlElicitationRegistry,
      kv: kvRuntime,
    });

  const verifyPermissions = options?.verifyRuntimePermissions ?? defaultVerifyRuntimePermissions;

  let isRunning = false;
  let lastError: Error | null = null;
  let startInProgress: Promise<void> | null = null;
  let stopInProgress: Promise<void> | null = null;
  let disposeSignalHandlers: (() => void) | null = null;

  const start = async (): Promise<void> => {
    if (isRunning) return;
    if (startInProgress) return await startInProgress;
    if (stopInProgress) await stopInProgress;

    startInProgress = (async () => {
      lastError = null;
      if (!disposeSignalHandlers) {
        disposeSignalHandlers = setupSignalHandlers(stop);
      }
      try {
        console.error(`${APP_NAME} starting...`);
        await verifyPermissions(config);
        await kvRuntime.open(config.kv.path);
        await runTaskStartupMaintenance({ kv: kvRuntime });
        if (options?.enableMaintenanceCrons !== false) {
          startMaintenanceCrons({ urlElicitationRegistry });
        }
        await startTaskQueueWorker(kvRuntime);
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
          kvRuntime.close(),
        ]);
        disposeSignalHandlers?.();
        disposeSignalHandlers = null;
        throw lastError;
      } finally {
        startInProgress = null;
      }
    })();

    return await startInProgress;
  };

  const stop = async (): Promise<void> => {
    if (startInProgress) await startInProgress.catch(() => {});
    try {
      if (!isRunning) return;
      if (stopInProgress) return await stopInProgress;

      stopInProgress = (async () => {
        stopTaskQueueWorker();
        const results = await Promise.allSettled([
          stdio.disconnect(),
          http.disconnect(),
          kvRuntime.close(),
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
    } finally {
      disposeSignalHandlers?.();
      disposeSignalHandlers = null;
    }
  };

  return {
    start,
    stop,
    isRunning: () => isRunning,
  };
}
