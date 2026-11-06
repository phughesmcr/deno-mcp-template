import { createHonoApp } from "$/app/http/hono.ts";
import type { KvRuntime } from "$/kv/runtime.ts";
import {
  createUrlElicitation,
  getUrlElicitation,
  resolveUrlElicitation,
  URL_ELICITATION_TTL_MS,
} from "$/mcp/urlElicitation/store.ts";
import { withMemoryKv } from "./memoryKv.ts";
import { assert, assertEquals, baseHttpConfig, noopMcpHandler } from "./helpers.ts";

function createApp(runtime: KvRuntime) {
  return createHonoApp({
    handler: noopMcpHandler,
    config: baseHttpConfig({ httpBearerToken: "secret" }),
    kv: runtime,
  });
}

function confirmRequest(elicitation: string, action: string): Request {
  return new Request("http://localhost/mcp-elicitation/confirm", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ elicitation, action }).toString(),
  });
}

for (
  const { action, status, heading } of [
    { action: "confirm", status: "confirmed", heading: "Confirmed" },
    { action: "cancel", status: "cancelled", heading: "Cancelled" },
  ] as const
) {
  Deno.test({
    name: `POST /mcp-elicitation/confirm records the outcome once (${action})`,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () =>
      withMemoryKv(async (kv, runtime) => {
        const id = await createUrlElicitation(kv, "demo");
        const app = createApp(runtime);

        const res = await app.fetch(confirmRequest(id, action), { clientIp: "127.0.0.1" });
        assertEquals(res.status, 200);
        assert((await res.text()).includes(heading), `expected ${heading} outcome page`);
        assertEquals((await getUrlElicitation(kv, id))?.status, status);

        // Already resolved: a second submit must not flip the outcome.
        const again = await app.fetch(
          confirmRequest(id, action === "confirm" ? "cancel" : "confirm"),
          { clientIp: "127.0.0.1" },
        );
        assertEquals(again.status, 400);
        assertEquals((await getUrlElicitation(kv, id))?.status, status);
      }),
  });
}

Deno.test({
  name: "GET /mcp-elicitation/confirm renders pending label and rejects unknown ids",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withMemoryKv(async (kv, runtime) => {
      const id = await createUrlElicitation(kv, "<b>demo</b>");
      const app = createApp(runtime);

      const ok = await app.fetch(
        new Request(`http://localhost/mcp-elicitation/confirm?elicitation=${id}`),
        { clientIp: "127.0.0.1" },
      );
      assertEquals(ok.status, 200);
      const html = await ok.text();
      assert(html.includes("&lt;b&gt;demo&lt;/b&gt;"), "label must be escaped");

      const unknown = await app.fetch(
        new Request(
          "http://localhost/mcp-elicitation/confirm?elicitation=00000000-0000-4000-8000-000000000002",
        ),
        { clientIp: "127.0.0.1" },
      );
      assertEquals(unknown.status, 400);
    }),
});

Deno.test({
  name: "URL elicitation store: resolves once and treats expired records as unknown",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withMemoryKv(async (kv) => {
      const id = await createUrlElicitation(kv, "once");
      assertEquals((await getUrlElicitation(kv, id))?.label, "once");
      assertEquals(await resolveUrlElicitation(kv, id, "confirmed"), true);
      assertEquals(await resolveUrlElicitation(kv, id, "cancelled"), false);
      assertEquals((await getUrlElicitation(kv, id))?.status, "confirmed");

      const stale = await createUrlElicitation(kv, "stale");
      const realNow = Date.now;
      Date.now = () => realNow() + URL_ELICITATION_TTL_MS + 1;
      try {
        assertEquals(await getUrlElicitation(kv, stale), undefined);
        assertEquals(await resolveUrlElicitation(kv, stale, "confirmed"), false);
      } finally {
        Date.now = realNow;
      }
    }),
});
