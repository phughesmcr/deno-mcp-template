import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createHonoApp } from "$/app/http/hono.ts";
import type { HTTPTransportManager } from "$/app/http/transport.ts";
import { assert, assertEquals, baseHttpConfig } from "./helpers.ts";

function createTestApp(transports: HTTPTransportManager) {
  return createHonoApp({
    createMcpServer: () => ({}) as McpServer,
    config: baseHttpConfig(),
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

Deno.test({
  name: "non-MCP routes do not expose Error.message in 500 responses",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createTestApp({
      acquire: async () => {
        throw new Error("not used for this route");
      },
      get: () => undefined,
      releaseAll: async () => {},
      close: async () => {},
    });

    const leakMarker = "UNIQUE_INTERNAL_DETAIL_DO_NOT_EXPOSE";
    app.get("/test-internal-error", () => {
      throw new Error(leakMarker);
    });

    const response = await app.fetch(
      new Request("http://localhost/test-internal-error"),
      { clientIp: "127.0.0.1" },
    );
    const body = await response.text();

    assertEquals(response.status, 500);
    assert(
      !body.includes(leakMarker),
      "response body must not include internal error message",
    );
    assert(body.includes("Internal server error"), "expected generic error body");
  },
});
