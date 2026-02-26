import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createHonoApp } from "$/app/http/hono.ts";
import type { HTTPTransportManager } from "$/app/http/transport.ts";
import type { AppConfig } from "$/shared/types.ts";

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
  jsonResponseMode: false,
};

const noopTransports: HTTPTransportManager = {
  acquire: async () => {
    throw new Error("not used in rate-limit tests");
  },
  get: () => undefined,
  releaseAll: async () => {},
  close: async () => {},
};

function createTestApp() {
  return createHonoApp({
    createMcpServer: () => ({}) as McpServer,
    config: defaultHttpConfig,
    transports: noopTransports,
  });
}

async function performRequest(
  app: ReturnType<typeof createTestApp>,
  clientIp: string,
  headers?: HeadersInit,
): Promise<Response> {
  const req = new Request("http://localhost/", { method: "GET", headers });
  return await app.fetch(req, { clientIp } as never);
}

Deno.test({
  name: "rate limiter uses stable client identity even with spoofed forwarding headers",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createTestApp();
    const clientIp = "10.10.10.10";

    for (let i = 0; i < 100; i++) {
      const response = await performRequest(app, clientIp, {
        "x-forwarded-for": `203.0.113.${i}`,
        "x-real-ip": `198.51.100.${i}`,
      });
      assertEquals(response.status, 200);
    }

    const blocked = await performRequest(app, clientIp, {
      "x-forwarded-for": "192.0.2.250",
      "x-real-ip": "192.0.2.251",
    });

    assertEquals(blocked.status, 429);
  },
});

Deno.test({
  name: "rate limiter does not share fallback bucket across distinct client IPs",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createTestApp();

    for (let i = 0; i < 100; i++) {
      const response = await performRequest(app, "10.0.0.1");
      assertEquals(response.status, 200);
    }

    const otherClient = await performRequest(app, "10.0.0.2");
    assertEquals(otherClient.status, 200);
  },
});
