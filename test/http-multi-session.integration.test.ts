import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createHonoApp } from "$/app/http/hono.ts";
import type { HTTPTransportManager } from "$/app/http/transport.ts";
import type { AppConfig } from "$/shared/types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const defaultHttpConfig: AppConfig["http"] = {
  enabled: true,
  hostname: "127.0.0.1",
  port: 3001,
  headers: [],
  allowedHosts: [],
  allowedOrigins: [],
  enableDnsRebinding: false,
  jsonResponseMode: true,
};

class FakeTransport {
  connected = false;

  async handleRequest(_request: Request, _options?: { parsedBody?: unknown }): Promise<Response> {
    if (!this.connected) {
      throw new Error("transport is not connected");
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
}

Deno.test({
  name:
    "HTTP route handler does not reuse a single MCP protocol instance across independent sessions",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const firstTransport = new FakeTransport();
    const secondTransport = new FakeTransport();
    let acquireCount = 0;

    const createSingleTransportMcp = (): McpServer => {
      let hasConnectedTransport = false;
      return {
        connect: async (transport: FakeTransport) => {
          if (hasConnectedTransport && !transport.connected) {
            throw new Error(
              "Already connected to a transport. Call close() before connecting to a new transport, or use a separate Protocol instance per connection.",
            );
          }
          transport.connected = true;
          hasConnectedTransport = true;
        },
      } as unknown as McpServer;
    };

    const transports: HTTPTransportManager = {
      acquire: async () => {
        acquireCount += 1;
        return (acquireCount === 1 ? firstTransport : secondTransport) as never;
      },
      get: () => undefined,
      releaseAll: async () => {},
      close: async () => {},
    };

    const app = createHonoApp({
      createMcpServer: createSingleTransportMcp,
      config: defaultHttpConfig,
      transports,
    });

    const initializeBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0",
        },
      },
    });

    const firstResponse = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: initializeBody,
      }),
      { clientIp: "127.0.0.1" },
    );
    assertEquals(firstResponse.status, 200);

    const secondResponse = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: initializeBody,
      }),
      { clientIp: "127.0.0.2" },
    );
    assert(
      secondResponse.status === 200,
      `expected second session to initialize, got ${secondResponse.status}`,
    );
  },
});
