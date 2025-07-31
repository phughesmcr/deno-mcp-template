import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppConfig } from "$/shared/types.ts";
import { createHttpServer } from "./http/mod.ts";
import { setupSignalHandlers } from "./signals.ts";
import { createStdioManager } from "./stdio.ts";

export type App = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function createApp(mcp: McpServer, config: AppConfig): App {
  const stdio = createStdioManager(mcp, config.stdio);
  const http = createHttpServer(mcp, config.http);

  const start = async () => {
    await Promise.all([
      stdio.connect(),
      http.connect(),
    ]);
  };

  const stop = async () => {
    await Promise.all([
      stdio.disconnect(),
      http.disconnect(),
    ]);
  };

  setupSignalHandlers(stop);

  return { start, stop };
}
