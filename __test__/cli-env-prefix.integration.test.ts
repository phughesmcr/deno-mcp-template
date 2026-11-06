/**
 * Spawns `deno eval` via {@link Deno.Command}; needs `--allow-run` when run outside
 * `deno task test:integration` / `test:coverage` (those run this file in a second pass).
 */
import { assert, assertEquals } from "./helpers.ts";

async function getAllowedOriginsFromEnv(env: Record<string, string>): Promise<string[]> {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      "import { handleCliArgs } from './src/app/cli.ts'; const config = await handleCliArgs(); console.log(JSON.stringify(config.http.allowedOrigins ?? []));",
    ],
    env,
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();
  if (output.code !== 0) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(`Failed to read CLI config from env: ${stderr}`);
  }

  const stdout = new TextDecoder().decode(output.stdout).trim();
  const lines = stdout.split("\n").filter(Boolean);
  const lastLine = lines.at(-1) ?? "[]";
  return JSON.parse(lastLine) as string[];
}

Deno.test("CLI accepts MCP_ALLOWED_ORIGINS env var", async () => {
  const expected = "http://prefixed-origin.local";
  const origins = await getAllowedOriginsFromEnv({
    MCP_DNS_REBINDING: "true",
    MCP_ALLOWED_HOSTS: "localhost",
    MCP_ALLOWED_ORIGINS: expected,
  });
  assert(origins.includes(expected), "Expected MCP_ALLOWED_ORIGINS to be applied");
});

Deno.test("CLI ignores unprefixed ALLOWED_ORIGINS env var", async () => {
  const expected = "http://prefixed-origin.local";
  const legacy = "http://legacy-origin.local";
  const origins = await getAllowedOriginsFromEnv({
    MCP_DNS_REBINDING: "true",
    MCP_ALLOWED_HOSTS: "localhost",
    MCP_ALLOWED_ORIGINS: expected,
    ALLOWED_ORIGINS: legacy,
  });
  assert(origins.includes(expected), "Expected prefixed MCP_ALLOWED_ORIGINS to remain applied");
  assert(!origins.includes(legacy), "Expected unprefixed ALLOWED_ORIGINS to be ignored");
});

/** Loads the config and never starts a server. `code` is 0 when the config is valid. */
async function getTransportsFromEnv(
  env: Record<string, string>,
  print = "{ http: http.enabled, stdio: stdio.enabled }",
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      `import { handleCliArgs } from './src/app/cli.ts'; const { http, stdio } = await handleCliArgs(); console.log(JSON.stringify(${print}));`,
    ],
    env,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    code,
    stdout: decoder.decode(stdout).trim().split("\n").at(-1) ?? "",
    stderr: decoder.decode(stderr),
  };
}

Deno.test("CLI enables both transports by default", async () => {
  const { stdout } = await getTransportsFromEnv({});
  assertEquals(stdout, `{"http":true,"stdio":true}`);
});

Deno.test("CLI serves 2025-era STDIO clients only with MCP_LEGACY_STDIO", async () => {
  const print = "{ legacy: stdio.legacy }";
  assertEquals((await getTransportsFromEnv({}, print)).stdout, `{"legacy":false}`);
  assertEquals(
    (await getTransportsFromEnv({ MCP_LEGACY_STDIO: "true" }, print)).stdout,
    `{"legacy":true}`,
  );
});

Deno.test("CLI disables HTTP with MCP_NO_HTTP", async () => {
  const { stdout } = await getTransportsFromEnv({ MCP_NO_HTTP: "true" });
  assertEquals(stdout, `{"http":false,"stdio":true}`);
});

Deno.test("CLI disables STDIO with MCP_NO_STDIO", async () => {
  const { stdout } = await getTransportsFromEnv({ MCP_NO_STDIO: "true" });
  assertEquals(stdout, `{"http":true,"stdio":false}`);
});

Deno.test("CLI keeps a transport when its MCP_NO_* var is false", async () => {
  const { stdout } = await getTransportsFromEnv({ MCP_NO_HTTP: "false", MCP_NO_STDIO: "false" });
  assertEquals(stdout, `{"http":true,"stdio":true}`);
});

Deno.test("CLI refuses to disable both transports through env vars", async () => {
  const { code, stderr } = await getTransportsFromEnv({
    MCP_NO_HTTP: "true",
    MCP_NO_STDIO: "true",
  });
  assert(code !== 0, "Expected a config error");
  assert(stderr.includes("Both the HTTP and STDIO servers are disabled"), stderr);
});
