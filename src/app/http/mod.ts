import {
  createMcpHandler,
  type McpHttpHandler,
  type McpServer,
  type ServerEventBus,
  UnsupportedProtocolVersionError,
} from "@modelcontextprotocol/server";
import type { Hono } from "hono";

import type { KvRuntime } from "$/kv/runtime.ts";
import { mcpServerDefinition } from "$/mcp/serverDefinition.ts";
import type { HttpServerConfig, Transport } from "$/shared/config-types.ts";
import { APP_NAME, BODY_LIMIT } from "$/shared/constants.ts";
import {
  shouldWarnAllInterfacesBindWithoutHostAllowlist,
  shouldWarnUnauthenticatedHttp,
} from "$/shared/httpSecurityPolicy.ts";
import { createHonoApp } from "./hono.ts";
import type { HonoEnv } from "./honoEnv.ts";

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
 * What to log for an error from the MCP handler. The SDK refusing a bad request is the client's
 * fault and routine on a public endpoint, so it gets one line. Anything else keeps its stack.
 */
export function describeMcpError(error: Error): Error | string {
  const refused = error instanceof UnsupportedProtocolVersionError ||
    error.message.startsWith("Rejected ");
  return refused ? error.message : error;
}

/**
 * Creates a HTTP server using Hono and Deno.serve
 * @param createMcpServer - Factory that creates an MCP server for each request
 * @param config - The HTTP server configuration
 * @param deps - Shared KV runtime and the bus feeding `subscriptions/listen` streams
 * @returns The HTTP transport instance
 */
export function createHttpServer(
  createMcpServer: () => McpServer,
  config: HttpServerConfig,
  deps: { kv: KvRuntime; events: ServerEventBus },
): Transport {
  const { enabled, hostname, port, tlsCert, tlsKey } = config;
  /** Lazily built when HTTP is enabled and {@linkcode connect} runs (avoids rate-limiter timers when HTTP is off). */
  let handler: McpHttpHandler | null = null;
  let hono: Hono<HonoEnv> | null = null;
  let server: Deno.HttpServer | null = null;

  const ensureStack = (): void => {
    if (!enabled) return;
    handler ??= createMcpHandler(createMcpServer, {
      legacy: "reject",
      bus: deps.events,
      responseMode: config.jsonResponseMode ? "json" : "auto",
      maxRequestBodySize: BODY_LIMIT,
      onerror: (error) => console.error(`${APP_NAME}: MCP request error`, describeMcpError(error)),
    });
    hono ??= createHonoApp({
      handler,
      config,
      kv: deps.kv,
      urlElicitation: mcpServerDefinition.urlElicitation,
    });
  };

  const connect = () => {
    if (!enabled || server !== null) return;
    ensureStack();
    const app = hono;
    if (!app) return;
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
      return app.fetch(request, { clientIp });
    });
  };

  const disconnect = async () => {
    if (!enabled || server === null) return;
    try {
      await handler?.close();
    } catch (error) {
      console.error(`${APP_NAME}: MCP handler cleanup failed`, error);
    } finally {
      handler = null;
      hono = null;
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
