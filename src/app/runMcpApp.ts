import { type App, createApp } from "$/app/app.ts";
import { handleCliArgs } from "$/app/cli.ts";
import type { CreateTransportScopedMcpServer } from "$/mcp/context.ts";
import type { AppConfig } from "$/shared/config-types.ts";

export type RunMcpAppOptions = {
  /** @default {@link handleCliArgs} */
  loadConfig?: () => Promise<AppConfig>;
};

/**
 * Load config, build the app, and start (intended for `main.ts`).
 */
export async function runMcpApp(
  createMcpServer: CreateTransportScopedMcpServer,
  options?: RunMcpAppOptions,
): Promise<App> {
  const loadConfig = options?.loadConfig ?? handleCliArgs;
  const config = await loadConfig();
  const app = createApp(createMcpServer, config);
  await app.start();
  return app;
}
