import { validateHosts } from "$/shared/validation/host.ts";
import { assert, assertEquals } from "./helpers.ts";

Deno.test("validateHosts keeps unbracketed IPv6 literals intact", () => {
  const hosts = validateHosts(["2001:db8::1"]);
  assertEquals(hosts[0], "2001:db8::1");
});

Deno.test("validateHosts strips port from bracketed IPv6 hosts", () => {
  const hosts = validateHosts(["[2001:db8::1]:3001"]);
  assertEquals(hosts[0], "[2001:db8::1]");
});

Deno.test("validateHosts still strips port from hostname values", () => {
  const hosts = validateHosts(["localhost:3001"]);
  assertEquals(hosts[0], "localhost");
});

Deno.test("validateHosts keeps subdomain wildcards", () => {
  assertEquals(validateHosts(["*.Example.com"])[0], "*.example.com");
});

Deno.test("validateHosts rejects wildcards that would match too much", () => {
  for (const host of ["*.com", "*.", "*.0.0.1", "*.*.example.com", "a.*.example.com"]) {
    let threw = false;
    try {
      validateHosts([host]);
    } catch {
      threw = true;
    }
    assert(threw, `accepted ${host}`);
  }
});
