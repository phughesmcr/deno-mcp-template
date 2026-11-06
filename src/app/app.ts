import { InMemoryServerEventBus } from "@modelcontextprotocol/server";

import { getProcessKvRuntime } from "$/kv/mod.ts";
import type { KvRuntime } from "$/kv/runtime.ts";
import { createKvWatcher } from "$/kv/watch.ts";
import type { CreateMcpServer, McpServerFactoryContext } from "$/mcp/context.ts";
import { createRequestState } from "$/mcp/requestState.ts";
import { RESOURCE_KV_KEYS } from "$/mcp/resources/kvKeys.ts";
import type { AppConfig, Transport } from "$/shared/config-types.ts";
import { APP_NAME } from "$/shared/constants.ts";
import { resolvePublicBaseUrl } from "$/shared/publicBaseUrl.ts";
import { getRejected } from "$/shared/utils.ts";
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
}>;

/**
 * Creates the main application instance with STDIO and HTTP transports.
 *
 * `createMcpServer` is a factory: STDIO calls it once per connection and HTTP once per request, so
 * instances hold no state of their own. Everything that outlives a request is in the shared
 * {@link McpServerFactoryContext} or in KV.
 *
 * @param createMcpServer - Factory invoked per connection / request (see above)
 * @param config - The application configuration
 * @param options - Optional test / alternate wiring (see {@link CreateAppOptions}).
 */
export function createApp(
  createMcpServer: CreateMcpServer,
  config: AppConfig,
  options?: CreateAppOptions,
): App {
  const kvRuntime = options?.kv ?? getProcessKvRuntime();
  kvRuntime.configurePath(config.kv.path);
  const events = new InMemoryServerEventBus((error) => {
    console.error(`${APP_NAME}: event listener failed`, error);
  });
  const ctx: McpServerFactoryContext = {
    kv: kvRuntime,
    events,
    requestState: createRequestState(config.mcp.requestStateKey),
    publicBaseUrl: resolvePublicBaseUrl(config.http),
  };
  const createServer = () => createMcpServer(ctx);
  const stdio = options?.stdio ?? createStdioManager(createServer, events, config.stdio);
  const http = options?.http ??
    createHttpServer(createServer, config.http, { kv: kvRuntime, events });
  const watcher = createKvWatcher(kvRuntime);

  /** KV watches also see writes from other processes, unlike the in-process event bus. */
  const watchResources = async (): Promise<void> => {
    for (const [uri, key] of RESOURCE_KV_KEYS) {
      await watcher.watch(uri, key, () => events.publish({ kind: "resource_updated", uri }));
    }
  };

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
        if (config.http.enabled && !config.mcp.requestStateKey) {
          console.error(
            `${APP_NAME}: MCP_REQUEST_STATE_KEY is not set, so this process signs requestState ` +
              "with a random key. Multi-round calls will fail across restarts and instances.",
          );
        }
        await watchResources();
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
        await Promise.allSettled([stdio.disconnect(), http.disconnect(), watcher.stop()]);
        await kvRuntime.close();
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
        const results = await Promise.allSettled([
          stdio.disconnect(),
          http.disconnect(),
          watcher.stop(),
        ]);
        results.push(...await Promise.allSettled([kvRuntime.close()]));
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
