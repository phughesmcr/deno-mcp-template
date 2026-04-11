import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createHonoApp } from "$/app/http/hono.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import { assertEquals, baseHttpConfig, noopTransports } from "./helpers.ts";

function createTestApp(config: AppConfig["http"] = baseHttpConfig()) {
  return createHonoApp({
    createMcpServer: () => ({}) as McpServer,
    config,
    transports: noopTransports,
  });
}

async function performRequest(
  app: ReturnType<typeof createTestApp>,
  clientIp: string | undefined,
  headers?: HeadersInit,
): Promise<Response> {
  const req = new Request("http://localhost/", { method: "GET", headers });
  const bindings = clientIp !== undefined ? { clientIp } : {};
  return await app.fetch(req, bindings as never);
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

Deno.test({
  name: "with trust-proxy, rate limiter uses X-Forwarded-For when socket IP is absent",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createTestApp(baseHttpConfig({ trustProxy: true }));
    const xff = "203.0.113.77";

    for (let i = 0; i < 100; i++) {
      const response = await performRequest(app, undefined, {
        "x-forwarded-for": xff,
      });
      assertEquals(response.status, 200);
    }

    const blocked = await performRequest(app, undefined, {
      "x-forwarded-for": xff,
    });
    assertEquals(blocked.status, 429);
  },
});

Deno.test({
  name: "requests with no IP and no session use strict unknown-client rate limit",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createTestApp();

    for (let i = 0; i < 20; i++) {
      const response = await performRequest(app, undefined, {});
      assertEquals(response.status, 200);
    }

    const blocked = await performRequest(app, undefined, {});
    assertEquals(blocked.status, 429);
  },
});
