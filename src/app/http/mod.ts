import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { APP_NAME } from "$/shared/constants.ts";
import type { HttpServerConfig, Transport } from "$/shared/types.ts";
import { createHonoApp } from "./hono.ts";
import { createHTTPTransportManager } from "./transport.ts";

function resolveClientIp(info: Deno.ServeHandlerInfo<Deno.Addr>): string | undefined {
  const remoteAddr = info.remoteAddr;
  if ("hostname" in remoteAddr) {
    return remoteAddr.hostname;
  }
  if ("path" in remoteAddr) {
    return remoteAddr.path;
  }
  return undefined;
}

/**
 * Creates a HTTP server using Hono and Deno.serve
 * @param createMcpServer - Factory that creates MCP server instances
 * @param config - The HTTP server configuration
 * @returns The HTTP transport instance
 */
export function createHttpServer(
  createMcpServer: () => McpServer,
  config: HttpServerConfig,
): Transport {
  const { enabled, hostname, port, tlsCert, tlsKey } = config;
  const transports = createHTTPTransportManager(config);
  const hono = createHonoApp({ createMcpServer, config, transports });
  let server: Deno.HttpServer | null = null;

  const connect = () => {
    if (!enabled || server !== null) return;
    const isTlsEnabled = !!tlsCert && !!tlsKey;
    const serveOptions = isTlsEnabled ?
      {
        hostname,
        port,
        cert: Deno.readTextFileSync(tlsCert),
        key: Deno.readTextFileSync(tlsKey),
        onListen: () => {
          console.error(`${APP_NAME} listening on https://${hostname}:${port}`);
        },
      } :
      {
        hostname,
        port,
        onListen: () => {
          console.error(`${APP_NAME} listening on http://${hostname}:${port}`);
        },
      };
    server = Deno.serve(serveOptions, (request, info) => {
      const clientIp = resolveClientIp(info);
      return hono.fetch(request, { clientIp });
    });
  };

  const disconnect = async () => {
    if (!enabled || server === null) return;
    try {
      await transports.releaseAll();
      await transports.close();
    } catch {
      /* ignore */
    } finally {
      server?.unref();
      await server?.shutdown();
      server = null;
    }
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
