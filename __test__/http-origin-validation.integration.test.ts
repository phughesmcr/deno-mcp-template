import { createHonoApp } from "$/app/http/hono.ts";
import { getProcessKvRuntime } from "$/kv/mod.ts";
import { assert, assertEquals, baseHttpConfig, noopMcpHandler } from "./helpers.ts";

const ALLOWED = "https://app.example";

async function send(method: string, headers: HeadersInit): Promise<Response> {
  const app = createHonoApp({
    config: baseHttpConfig({ allowedOrigins: [ALLOWED] }),
    handler: noopMcpHandler,
    kv: getProcessKvRuntime(),
  });
  const body = method === "POST" ? "{}" : undefined;
  const request = new Request("http://localhost/mcp", { method, headers, body });
  return await app.fetch(request, { clientIp: "127.0.0.1" });
}

const post = (origin?: string) => send("POST", origin ? { origin } : {});
const preflight = (origin: string) =>
  send("OPTIONS", { origin, "access-control-request-method": "POST" });

for (
  const origin of [
    "https://evil.example",
    "http://app.example",
    "https://app.example:8443",
    "https://sub.app.example",
    "null",
  ]
) {
  Deno.test(`POST /mcp refuses Origin ${origin} with a JSON-RPC 403`, async () => {
    const response = await post(origin);

    assertEquals(response.status, 403);
    assertEquals(response.headers.get("access-control-allow-origin"), null);
    const body = await response.json() as { jsonrpc?: string; error?: unknown };
    assertEquals(body.jsonrpc, "2.0");
    assert(body.error, "expected a JSON-RPC error");
    assert(!("id" in body), "expected no id");
  });
}

Deno.test("POST /mcp reaches the handler with an allowed Origin", async () => {
  const response = await post(ALLOWED);

  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), ALLOWED);
});

Deno.test("POST /mcp reaches the handler with no Origin", async () => {
  assertEquals((await post()).status, 204);
});

Deno.test("OPTIONS /mcp still answers a preflight from an allowed Origin", async () => {
  const response = await preflight(ALLOWED);

  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), ALLOWED);
});

Deno.test("OPTIONS /mcp refuses a preflight from any other Origin", async () => {
  const response = await preflight("https://evil.example");

  assertEquals(response.status, 403);
  await response.body?.cancel();
});
