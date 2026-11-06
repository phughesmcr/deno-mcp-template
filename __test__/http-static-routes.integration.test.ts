import { createHonoApp } from "$/app/http/hono.ts";
import { getProcessKvRuntime } from "$/kv/mod.ts";
import { assertEquals, baseHttpConfig, noopMcpHandler } from "./helpers.ts";

function get(path: string): Promise<Response> {
  const app = createHonoApp({
    config: baseHttpConfig(),
    handler: noopMcpHandler,
    kv: getProcessKvRuntime(),
  });
  return Promise.resolve(
    app.fetch(new Request(`http://localhost${path}`), { clientIp: "127.0.0.1" }),
  );
}

for (const path of ["/favicon.ico", "/static/icon.png", "/.well-known/llms.txt"]) {
  Deno.test(`GET ${path} serves the file`, async () => {
    const response = await get(path);
    await response.body?.cancel();
    assertEquals(response.status, 200);
  });
}

Deno.test("GET /static/ cannot climb out of the static folder", async () => {
  const response = await get("/static/../deno.json");
  await response.body?.cancel();
  assertEquals(response.status, 404);
});
