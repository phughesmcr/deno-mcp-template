import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Hono } from "hono";

import type { KvRuntime } from "$/kv/runtime.ts";
import type { UrlElicitationRegistry } from "$/mcp/urlElicitation/registry.ts";
import type { HttpServerConfig, Transport } from "$/shared/config-types.ts";
import { APP_NAME } from "$/shared/constants.ts";
import {
  shouldWarnAllInterfacesBindWithoutHostAllowlist,
  shouldWarnUnauthenticatedHttp,
} from "$/shared/httpSecurityPolicy.ts";
import { createHonoApp } from "./hono.ts";
import type { HonoEnv } from "./honoEnv.ts";
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
  deps?: { urlElicitationRegistry?: UrlElicitationRegistry; kv?: KvRuntime },
): Transport {
  const { enabled, hostname, port, tlsCert, tlsKey } = config;
  /** Lazily built when HTTP is enabled and {@linkcode connect} runs (avoids rate-limiter timers when HTTP is off). */
  let transports: ReturnType<typeof createHTTPTransportManager> | null = null;
  let hono: Hono<HonoEnv> | null = null;
  let server: Deno.HttpServer | null = null;

  const ensureStack = (): void => {
    if (!enabled) return;
    transports ??= createHTTPTransportManager(config, { kv: deps?.kv });
    hono ??= createHonoApp({
      createMcpServer,
      config,
      transports,
      urlElicitationRegistry: deps?.urlElicitationRegistry,
    });
  };

  const connect = () => {
    if (!enabled || server !== null) return;
    ensureStack();
    if (!hono) return;
    if (shouldWarnAllInterfacesBindWithoutHostAllowlist(config)) {
      console.error(
        `${APP_NAME}: HTTP is binding to ${hostname} without Host allowlist middleware. ` +
          "DNS rebinding protection is disabled. Use --hostname localhost (or 127.0.0.1), " +
          "or enable --dnsRebinding with --host / MCP_ALLOWED_HOSTS for explicit Host validation.",
      );
    }
    if (shouldWarnUnauthenticatedHttp(config)) {
      console.error(
        `${APP_NAME}: HTTP is listening on a non-loopback address (${hostname}) without MCP_HTTP_BEARER_TOKEN. ` +
          "Any client that can reach this port can use MCP. Set a bearer token or place the server behind authenticated TLS.",
      );
    }
    const isTlsEnabled = !!tlsCert && !!tlsKey;
    function logListening(scheme: "http" | "https"): void {
      console.error(`${APP_NAME} listening on ${scheme}://${hostname}:${port}`);
    }
    const serveOptions = isTlsEnabled ?
      {
        hostname,
        port,
        cert: Deno.readTextFileSync(tlsCert),
        key: Deno.readTextFileSync(tlsKey),
        onListen: () => logListening("https"),
      } :
      {
        hostname,
        port,
        onListen: () => logListening("http"),
      };
    server = Deno.serve(serveOptions, (request, info) => {
      const clientIp = resolveClientIp(info);
      return hono!.fetch(request, { clientIp });
    });
  };

  const disconnect = async () => {
    if (!enabled || server === null) return;
    try {
      if (transports) {
        await transports.releaseAll();
        await transports.close();
      }
    } catch (error) {
      console.error(`${APP_NAME}: HTTP transport cleanup failed`, error);
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
