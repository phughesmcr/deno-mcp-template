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

Deno.test("rejects reserved IPv4 ranges", () => {
  const blocked = [
    "https://192.0.0.1/",
    "https://192.0.2.1/",
    "https://198.18.0.1/",
    "https://198.19.255.255/",
    "https://198.51.100.1/",
    "https://203.0.113.1/",
    "https://224.0.0.1/",
    "https://240.0.0.1/",
    "https://255.255.255.255/",
  ];
  for (const url of blocked) {
    assert(!isUrlAllowedForServerSideFetch(new URL(url), httpsOnly), url);
  }
});

Deno.test("rejects private IPv4 embedded in IPv6", () => {
  const blocked = [
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:169.254.169.254]/",
    "https://[::ffff:0:127.0.0.1]/",
    "https://[::127.0.0.1]/",
    "https://[64:ff9b::7f00:1]/",
    "https://[2002:7f00:1::]/",
  ];
  for (const url of blocked) {
    assert(!isUrlAllowedForServerSideFetch(new URL(url), httpsOnly), url);
  }
});

Deno.test("rejects IPv6 outside global unicast", () => {
  const blocked = [
    "https://[::]/",
    "https://[64:ff9b:1::1]/",
    "https://[100::1]/",
    "https://[2001::1]/",
    "https://[2001:db8::1]/",
    "https://[fe80::1]/",
    "https://[fec0::1]/",
    "https://[ff02::1]/",
  ];
  for (const url of blocked) {
    assert(!isUrlAllowedForServerSideFetch(new URL(url), httpsOnly), url);
  }
});

Deno.test("rejects blocked hostnames with a trailing dot", () => {
  const blocked = [
    "https://localhost./",
    "https://localhost../",
    "https://foo.localhost./",
    "https://metadata.google.internal./",
    "https://printer.local./",
  ];
  for (const url of blocked) {
    assert(!isUrlAllowedForServerSideFetch(new URL(url), httpsOnly), url);
  }
});

Deno.test("allows public addresses in every form", () => {
  const allowed = [
    "https://example.com./",
    "https://8.8.8.8/",
    "https://198.20.0.1/",
    "https://[2606:4700:4700::1111]/",
    "https://[::ffff:8.8.8.8]/",
    "https://[64:ff9b::808:808]/",
    "https://[2002:808:808::]/",
  ];
  for (const url of allowed) {
    assert(isUrlAllowedForServerSideFetch(new URL(url), httpsOnly), url);
  }
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
