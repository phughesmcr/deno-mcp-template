import { validateHosts } from "$/shared/validation/host.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

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
