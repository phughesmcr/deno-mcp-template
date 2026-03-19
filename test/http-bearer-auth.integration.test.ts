import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { CliOptions } from "$/app/cli.ts";
import { createHonoApp } from "$/app/http/hono.ts";
import type { HTTPTransportManager } from "$/app/http/transport.ts";
import type { AppConfig } from "$/shared/types.ts";
import { validateHttpConfig } from "$/shared/validation/config.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const secret = "test-bearer-secret-xyz";

const httpConfigWithAuth: AppConfig["http"] = {
  enabled: true,
  hostname: "127.0.0.1",
  port: 3001,
  headers: [],
  allowedHosts: [],
  allowedOrigins: [],
  enableDnsRebinding: false,
  jsonResponseMode: false,
  trustProxy: false,
  httpBearerToken: secret,
};

const noopTransports: HTTPTransportManager = {
  acquire: async () => {
    throw new Error("not used in bearer auth tests");
  },
  get: () => undefined,
  releaseAll: async () => {},
  close: async () => {},
};

Deno.test({
  name: "POST /mcp returns 401 without bearer when token is configured",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createHonoApp({
      createMcpServer: () => ({}) as McpServer,
      config: httpConfigWithAuth,
      transports: noopTransports,
    });

    const response = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { clientIp: "127.0.0.1" },
    );

    assertEquals(response.status, 401);
    const body = await response.json() as { error?: string };
    assertEquals(body.error, "unauthorized");
  },
});

Deno.test({
  name: "POST /mcp passes auth with valid Bearer and reaches MCP handler",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createHonoApp({
      createMcpServer: () => ({}) as McpServer,
      config: httpConfigWithAuth,
      transports: noopTransports,
    });

    const response = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
        body: "",
      }),
      { clientIp: "127.0.0.1" },
    );

    assertEquals(response.status, 400);
    const payload = await response.json() as { error?: { message?: string } };
    assertEquals(payload.error?.message, "Empty request body");
  },
});

Deno.test({
  name: "OPTIONS /mcp is not blocked by bearer middleware (CORS preflight)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createHonoApp({
      createMcpServer: () => ({}) as McpServer,
      config: httpConfigWithAuth,
      transports: noopTransports,
    });

    const response = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "POST",
        },
      }),
      { clientIp: "127.0.0.1" },
    );

    assertEquals(response.status, 204);
  },
});

Deno.test({
  name: "validateHttpConfig fails when requireHttpAuth is set without token",
  fn: () => {
    const cli: CliOptions = {
      http: true,
      stdio: true,
      hostname: "localhost",
      port: 3001,
      headers: [],
      allowedOrigins: [],
      allowedHosts: [],
      dnsRebinding: false,
      jsonResponse: false,
      trustProxy: false,
      requireHttpAuth: true,
    };
    const result = validateHttpConfig(cli);
    if (result.success) throw new Error("expected failure");
    if (!result.error.message.includes("MCP_REQUIRE_HTTP_AUTH")) {
      throw new Error(result.error.message);
    }
  },
});
