import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createHonoApp } from "$/app/http/hono.ts";
import { createUrlElicitationRegistry } from "$/mcp/urlElicitation/registry.ts";
import { validateHttpConfig } from "$/shared/validation/config.ts";
import { assertEquals, baseCliOptions, baseHttpConfig, noopTransports } from "./helpers.ts";

const secret = "test-bearer-secret-xyz";

const httpConfigWithAuth = baseHttpConfig({
  trustProxy: false,
  httpBearerToken: secret,
});

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
  name: "GET /mcp-elicitation/confirm bypasses bearer auth",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const registry = createUrlElicitationRegistry();
    const app = createHonoApp({
      createMcpServer: () => ({}) as McpServer,
      config: httpConfigWithAuth,
      transports: noopTransports,
      urlElicitationRegistry: registry,
    });

    const url =
      "http://localhost/mcp-elicitation/confirm?session=00000000-0000-4000-8000-000000000001&elicitation=00000000-0000-4000-8000-000000000002";
    const response = await app.fetch(new Request(url), { clientIp: "127.0.0.1" });

    assertEquals(response.status, 400);
    const text = await response.text();
    if (text.includes("Unauthorized") || text.toLowerCase().includes("401")) {
      throw new Error("expected HTML error page, not auth failure");
    }
  },
});

Deno.test({
  name: "validateHttpConfig fails when requireHttpAuth is set without token",
  fn: () => {
    const cli = baseCliOptions({ requireHttpAuth: true });
    const result = validateHttpConfig(cli);
    if (result.success) throw new Error("expected failure");
    if (!result.error.message.includes("MCP_REQUIRE_HTTP_AUTH")) {
      throw new Error(result.error.message);
    }
  },
});
