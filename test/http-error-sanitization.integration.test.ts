import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createHonoApp } from "$/app/http/hono.ts";
import type { HTTPTransportManager } from "$/app/http/transport.ts";
import type { AppConfig } from "$/shared/types.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
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
  jsonResponseMode: false,
};

function createTestApp(transports: HTTPTransportManager) {
  return createHonoApp({
    createMcpServer: () => ({}) as McpServer,
    config: defaultHttpConfig,
    transports,
  });
}

Deno.test({
  name: "internal transport failures return sanitized JSON-RPC errors",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createTestApp({
      acquire: async () => {
        throw new Error("database timeout");
      },
      get: () => undefined,
      releaseAll: async () => {},
      close: async () => {},
    });

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    });

    const response = await app.fetch(request, { clientIp: "127.0.0.1" });
    const payload = await response.json();
    const error = payload?.error ?? {};
    const data = error?.data ?? {};

    assertEquals(response.status, 500);
    assertEquals(error.message, "Internal error");
    assert(typeof data.timestamp === "string", "expected timestamp in error data");
    assertEquals("stack" in data, false);
    assertEquals("errorType" in data, false);
    assertEquals("originalError" in data, false);
  },
});

Deno.test({
  name: "invalid requests still return specific client-facing validation errors",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createTestApp({
      acquire: async () => {
        throw new Error("not reached for empty request");
      },
      get: () => undefined,
      releaseAll: async () => {},
      close: async () => {},
    });

    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "",
    });

    const response = await app.fetch(request, { clientIp: "127.0.0.1" });
    const payload = await response.json();

    assertEquals(response.status, 400);
    assertEquals(payload?.error?.message, "Empty request body");
    assertEquals(payload?.error?.code, -32600);
  },
});
