import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppConfig } from "$/shared/types.ts";
import { createHttpServer } from "./http/server.ts";
import { setupSignalHandlers } from "./signals.ts";
import { createStdioTransportManager } from "./stdio.ts";

export async function createApp(mcp: McpServer, config: AppConfig) {
  const stdio = createStdioTransportManager(mcp, config.stdio);
  const http = createHttpServer(mcp, config.http);

  const start = async () => {
    await stdio.connect();
    await http.connect();
  };

  const stop = async () => {
    await stdio.disconnect();
    await http.disconnect();
  };

  setupSignalHandlers(stop);

  return { start, stop };
}
