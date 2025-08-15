import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { APP_NAME } from "$/shared/constants.ts";
import type { AppConfig, Transport } from "$/shared/types.ts";
import { createHonoApp } from "./hono.ts";
import { createHTTPTransportManager } from "./transport.ts";

/**
 * Creates a HTTP server using Hono and Deno.serve
 * @param mcp - The MCP server instance
 * @param config - The HTTP server configuration
 * @returns The HTTP transport instance
 */
export function createHttpServer(mcp: McpServer, config: AppConfig["http"]): Transport {
  const { enabled, hostname, port } = config;
  const transports = createHTTPTransportManager(config);
  const hono = createHonoApp({ mcp, config, transports });
  let server: Deno.HttpServer | null = null;

  const connect = async () => {
    if (!enabled || server !== null) return;
    server = Deno.serve({
      hostname,
      port,
      onListen: () => {
        console.error(`${APP_NAME} listening on ${hostname}:${port}`);
      },
    }, hono.fetch);
  };

  const disconnect = async () => {
    if (!enabled || server === null) return;
    try {
      await transports.releaseAll();
    } catch {
      /* ignore */
    }
    await server.shutdown();
    server = null;
  };

  const isRunning = () => !!server;
  const isEnabled = () => enabled;

  return {
    connect,
    disconnect,
    isEnabled,
    isRunning,
  };
}
