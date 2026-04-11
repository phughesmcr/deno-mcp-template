import { loadAppConfig, mapCommandOptionsToConfigInput } from "$/app/cli.ts";
import type { FileStatPort, McpConfigInput } from "$/shared/config-input.ts";
import { validateConfig, validateHttpConfig } from "$/shared/validation/config.ts";

import { assert, assertEquals, baseMcpConfigInput } from "./helpers.ts";

function fakeFiles(existingPaths: Set<string>, notFilePaths = new Set<string>()): FileStatPort {
  return {
    statFile(path: string) {
      if (notFilePaths.has(path)) return { kind: "error", code: "not_file" };
      if (existingPaths.has(path)) return { kind: "file" };
      return { kind: "error", code: "not_found" };
    },
  };
}

Deno.test("validateConfig rejects out-of-range port via single validatePort path", () => {
  const input: McpConfigInput = { ...baseMcpConfigInput(), port: 0 };
  const result = validateConfig(input, { files: fakeFiles(new Set()) });
  assertEquals(result.success, false);
  if (result.success) return;
  assert(
    result.error.message.includes("Must be between 1 and 65535"),
    result.error.message,
  );
});

Deno.test("validateHttpConfig uses FileStatPort for TLS paths (no real FS)", () => {
  const cert = "/certs/cert.pem";
  const key = "/certs/key.pem";
  const input: McpConfigInput = {
    ...baseMcpConfigInput(),
    tlsCert: cert,
    tlsKey: key,
  };
  const ok = validateHttpConfig(input, { files: fakeFiles(new Set([cert, key])) });
  assertEquals(ok.success, true);
  if (!ok.success) return;
  assertEquals(ok.value.tlsCert, cert);
  assertEquals(ok.value.tlsKey, key);
});

Deno.test("validateHttpConfig surfaces not_file from FileStatPort", () => {
  const cert = "/certs/cert.pem";
  const key = "/certs/key.pem";
  const input: McpConfigInput = {
    ...baseMcpConfigInput(),
    tlsCert: cert,
    tlsKey: key,
  };
  const bad = validateHttpConfig(input, {
    files: fakeFiles(new Set([cert, key]), new Set([key])),
  });
  assertEquals(bad.success, false);
  if (bad.success) return;
  assert(bad.error.message.includes("must point to a file"), bad.error.message);
});

Deno.test("loadAppConfig onFailure throw surfaces invalid port from argv", async () => {
  let threw = false;
  try {
    await loadAppConfig({
      argv: ["--port", "0"],
      onFailure: "throw",
    });
  } catch {
    threw = true;
  }
  assert(threw, "expected loadAppConfig to throw for invalid port");
});

Deno.test("mapCommandOptionsToConfigInput merges -H with headers array", () => {
  const raw = {
    header: ["X-A: 1"],
    headers: ["X-B: 2"],
    host: [],
    origin: [],
    noHttp: false,
    noStdio: false,
    port: 3001,
    hostname: "localhost",
    dnsRebinding: false,
    jsonResponse: false,
    trustProxy: false,
    requireHttpAuth: false,
    http: true,
    stdio: true,
    maxTaskTtlMs: 86_400_000,
  } as Parameters<typeof mapCommandOptionsToConfigInput>[0];
  const input = mapCommandOptionsToConfigInput(raw);
  assert(input.headers.includes("X-A: 1"));
  assert(input.headers.includes("X-B: 2"));
});
