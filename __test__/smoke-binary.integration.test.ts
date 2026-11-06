/**
 * Spawns a fake server binary via {@link Deno.Command}; needs `--allow-run` when run outside
 * `deno task test:integration` / `test:coverage` (those run this file in a second pass).
 */
import { smokeBinary } from "../scripts/smoke-binary.ts";
import { assert, assertEquals } from "./helpers.ts";

const FAKE_SERVER = `
if (Deno.args.includes("--no-http")) {
  for await (const _ of Deno.stdin.readable) {
    console.log(JSON.stringify({ result: { supportedVersions: [Deno.env.get("FAKE_VERSION")] } }));
    break;
  }
} else {
  const status = Number(Deno.env.get("FAKE_LLMS_STATUS"));
  Deno.serve({ hostname: "localhost", port: Number(Deno.env.get("MCP_PORT")), onListen() {} },
    () => new Response("llms", { status }));
}
`;

async function withFakeBinary(
  { version = "2026-07-28", llmsStatus = 200 },
  use: (bin: string, tempDir: string) => Promise<void>,
): Promise<void> {
  const root = await Deno.makeTempDir({ prefix: "smoke-binary-test-" });
  const tempDir = `${root}/tmp`;
  await Deno.mkdir(tempDir);
  await Deno.writeTextFile(`${root}/fake.ts`, FAKE_SERVER);
  await Deno.writeTextFile(
    `${root}/bin`,
    `#!/bin/sh
export FAKE_VERSION=${version} FAKE_LLMS_STATUS=${llmsStatus}
exec "${Deno.execPath()}" run -A --no-lock --no-config "${root}/fake.ts" "$@"
`,
  );
  await Deno.chmod(`${root}/bin`, 0o755);
  try {
    await use(`${root}/bin`, tempDir);
    assertEquals((await Array.fromAsync(Deno.readDir(tempDir))).length, 0);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

async function failure(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    return String(error);
  }
  throw new Error("expected a failure");
}

Deno.test("smokeBinary passes when stdio and static files both work", async () => {
  await withFakeBinary({}, async (bin, tempDir) => {
    assertEquals((await smokeBinary(bin, { tempDir })).join(), "2026-07-28");
  });
});

Deno.test("smokeBinary fails on the wrong protocol version", async () => {
  await withFakeBinary({ version: "2025-11-25" }, async (bin, tempDir) => {
    assert((await failure(smokeBinary(bin, { tempDir }))).includes("supportedVersions lacks"));
  });
});

Deno.test("smokeBinary fails when the binary can't serve static files", async () => {
  await withFakeBinary({ llmsStatus: 404 }, async (bin, tempDir) => {
    const message = await failure(smokeBinary(bin, { tempDir, timeoutMs: 2_000 }));
    assert(message.includes("/llms.txt") && message.includes("404"), message);
  });
});

Deno.test("smokeBinary leaves no temp files when the binary can't start", async () => {
  await withFakeBinary({}, async (bin, tempDir) => {
    await failure(smokeBinary(`${bin}-missing`, { tempDir }));
  });
});
