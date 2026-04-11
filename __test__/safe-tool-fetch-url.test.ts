import {
  assertUrlAllowedForServerSideFetch,
  DisallowedFetchUrlError,
  headUrlWithSafeRedirects,
  isUrlAllowedForServerSideFetch,
} from "$/shared/validation/safeToolFetchUrl.ts";
import { assert, assertEquals } from "./helpers.ts";

const httpsOnly = { allowHttp: false };
const httpAllowed = { allowHttp: true };

Deno.test("allows https public hostnames", () => {
  assert(isUrlAllowedForServerSideFetch(new URL("https://example.com/path"), httpsOnly));
});

Deno.test("rejects http when allowHttp is false", () => {
  assert(!isUrlAllowedForServerSideFetch(new URL("http://example.com/"), httpsOnly));
});

Deno.test("allows http public host when allowHttp is true", () => {
  assert(isUrlAllowedForServerSideFetch(new URL("http://example.com/"), httpAllowed));
});

Deno.test("rejects loopback and private IPv4", () => {
  const blocked = [
    "https://127.0.0.1/",
    "https://10.0.0.1/",
    "https://192.168.0.1/",
    "https://172.16.0.1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://100.64.0.1/",
    "https://0.0.0.0/",
  ];
  for (const s of blocked) {
    assert(!isUrlAllowedForServerSideFetch(new URL(s), httpsOnly), s);
  }
});

Deno.test("rejects localhost and .internal", () => {
  assert(!isUrlAllowedForServerSideFetch(new URL("https://localhost/"), httpsOnly));
  assert(!isUrlAllowedForServerSideFetch(new URL("https://app.internal/"), httpsOnly));
});

Deno.test("rejects IPv6 loopback and ULA", () => {
  assert(!isUrlAllowedForServerSideFetch(new URL("https://[::1]/"), httpsOnly));
  assert(!isUrlAllowedForServerSideFetch(new URL("https://[fc00::1]/"), httpsOnly));
});

Deno.test("assertUrlAllowed throws DisallowedFetchUrlError for blocked URL", () => {
  let threw = false;
  try {
    assertUrlAllowedForServerSideFetch(new URL("https://127.0.0.1/"), httpsOnly);
  } catch (e) {
    threw = e instanceof DisallowedFetchUrlError;
  }
  assert(threw, "expected DisallowedFetchUrlError");
});

Deno.test("headUrlWithSafeRedirects sets redirected when following a validated hop", async () => {
  const mockFetch: typeof fetch = (input) => {
    const u = String(input);
    if (u === "https://example.com/start") {
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/end" },
        }),
      );
    }
    if (u === "https://example.com/end") {
      return Promise.resolve(new Response(null, { status: 200, statusText: "OK" }));
    }
    return Promise.reject(new Error(`unexpected fetch ${u}`));
  };

  const { response, redirected } = await headUrlWithSafeRedirects(
    "https://example.com/start",
    AbortSignal.timeout(5000),
    { fetch: mockFetch },
  );

  assertEquals(redirected, true);
  assertEquals(response.status, 200);
});
