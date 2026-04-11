import { normalizePublicBaseUrl, resolvePublicBaseUrl } from "$/shared/publicBaseUrl.ts";
import { assertEquals, baseHttpConfig } from "./helpers.ts";

Deno.test("normalizePublicBaseUrl strips to origin", () => {
  assertEquals(normalizePublicBaseUrl("https://example.com/path?q=1"), "https://example.com");
});

Deno.test("normalizePublicBaseUrl rejects non-http(s)", () => {
  try {
    normalizePublicBaseUrl("ftp://example.com");
    throw new Error("expected throw");
  } catch (e) {
    if (e instanceof Error && e.message.includes("http")) return;
    throw e;
  }
});

Deno.test("resolvePublicBaseUrl is undefined when HTTP disabled", () => {
  assertEquals(resolvePublicBaseUrl(baseHttpConfig({ enabled: false })), undefined);
});

Deno.test("resolvePublicBaseUrl uses explicit publicBaseUrl", () => {
  const url = resolvePublicBaseUrl(
    baseHttpConfig({ publicBaseUrl: "https://proxy.example/mcp" }),
  );
  assertEquals(url, "https://proxy.example");
});

Deno.test("resolvePublicBaseUrl maps all-interfaces bind to 127.0.0.1", () => {
  const url = resolvePublicBaseUrl(
    baseHttpConfig({ hostname: "0.0.0.0", port: 4000 }),
  );
  assertEquals(url, "http://127.0.0.1:4000");
});

Deno.test("resolvePublicBaseUrl uses https when TLS paths set", () => {
  const url = resolvePublicBaseUrl(
    baseHttpConfig({
      tlsCert: "/tmp/cert.pem",
      tlsKey: "/tmp/key.pem",
    }),
  );
  assertEquals(url, "https://127.0.0.1:3001");
});
