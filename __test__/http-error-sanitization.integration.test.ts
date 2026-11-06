import { describeMcpError } from "$/app/http/mod.ts";
import { getProcessKvRuntime } from "$/kv/mod.ts";
import { createHonoApp, type McpFetchHandler } from "$/app/http/hono.ts";
import { assert, assertEquals, baseHttpConfig, noopMcpHandler } from "./helpers.ts";
import { createTestMcpHandler } from "./mcpHttp.ts";

function createTestApp(handler: McpFetchHandler = noopMcpHandler) {
  return createHonoApp({
    handler,
    config: baseHttpConfig(),
    kv: getProcessKvRuntime(),
  });
}

Deno.test({
  name: "internal handler failures return a generic error without internal details",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createTestApp({
      fetch: () => Promise.reject(new Error("database timeout")),
    });

    const response = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
      { clientIp: "127.0.0.1" },
    );
    const text = await response.text();

    assertEquals(response.status, 500);
    assert(!text.includes("database timeout"), "response must not leak the internal message");
    assert(text.includes("Internal error"), "expected generic error text");
    assert(!text.includes("stack"), "response must not include a stack");
  },
});

Deno.test({
  name: "invalid requests still return specific client-facing validation errors",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createTestApp(createTestMcpHandler());

    const response = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "",
      }),
      { clientIp: "127.0.0.1" },
    );
    const payload = await response.json();

    assertEquals(response.status, 400);
    assertEquals(typeof payload?.error?.message, "string");
    assertEquals(typeof payload?.error?.code, "number");
  },
});

Deno.test({
  name: "non-MCP routes do not expose Error.message in 500 responses",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createTestApp();

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

Deno.test("refused requests log one line, real failures keep their stack", () => {
  const refused = new Error("Rejected inbound request (envelope-invalid): bad _meta");
  assertEquals(describeMcpError(refused), refused.message);

  const failure = new Error("database timeout");
  assertEquals(describeMcpError(failure), failure);
});
