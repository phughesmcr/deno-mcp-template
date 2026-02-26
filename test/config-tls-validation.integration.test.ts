import type { CliOptions } from "$/app/cli.ts";
import { validateHttpConfig } from "$/shared/validation/config.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function createBaseCliOptions(): CliOptions {
  return {
    http: true,
    stdio: true,
    hostname: "localhost",
    port: 3001,
    headers: [],
    allowedOrigins: [],
    allowedHosts: [],
    dnsRebinding: false,
    jsonResponse: false,
  } as CliOptions;
}

Deno.test("validateHttpConfig requires both TLS cert and key", () => {
  const options = createBaseCliOptions();
  const result = validateHttpConfig({ ...options, tlsCert: "/tmp/cert.pem" } as CliOptions);
  assert(!result.success, "Expected validation to fail when TLS key is missing");
  if (result.success) return;
  assert(
    result.error.message.includes("requires both certificate and key"),
    "Expected pair-required TLS validation error message",
  );
});

Deno.test("validateHttpConfig rejects missing TLS files", () => {
  const options = createBaseCliOptions();
  const result = validateHttpConfig({
    ...options,
    tlsCert: "/tmp/definitely-missing-cert.pem",
    tlsKey: "/tmp/definitely-missing-key.pem",
  } as CliOptions);
  assert(!result.success, "Expected validation to fail for missing TLS files");
});

Deno.test("validateHttpConfig accepts valid TLS cert and key paths", async () => {
  const certPath = await Deno.makeTempFile({ suffix: ".pem" });
  const keyPath = await Deno.makeTempFile({ suffix: ".pem" });
  try {
    await Deno.writeTextFile(
      certPath,
      "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----",
    );
    await Deno.writeTextFile(
      keyPath,
      "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----",
    );
    const options = createBaseCliOptions();
    const result = validateHttpConfig({
      ...options,
      tlsCert: certPath,
      tlsKey: keyPath,
    } as CliOptions);

    assert(result.success, "Expected validation to pass for valid TLS files");
    if (!result.success) return;
    assertEquals(result.value.tlsCert, certPath);
    assertEquals(result.value.tlsKey, keyPath);
  } finally {
    await Deno.remove(certPath).catch(() => {});
    await Deno.remove(keyPath).catch(() => {});
  }
});
