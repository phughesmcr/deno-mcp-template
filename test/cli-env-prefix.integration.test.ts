function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

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
