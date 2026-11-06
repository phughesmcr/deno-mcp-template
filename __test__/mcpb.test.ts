import { packBundle } from "../scripts/mcpb.ts";
import { assert, assertEquals } from "./helpers.ts";

const BINARIES = [
  "server.exe",
  "server_mac_arm64",
  "server_mac_x64",
  "server_linux_x64",
  "server_linux_arm64",
];

async function project(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "mcpb-test-" });
  await Deno.mkdir(`${root}/dist/server`, { recursive: true });
  await Deno.mkdir(`${root}/static`);
  for (const name of BINARIES) await Deno.writeTextFile(`${root}/dist/server/${name}`, "");
  for (const name of ["mcpb-manifest.json", "icon.png", "mcpb-launcher.sh"]) {
    await Deno.writeTextFile(`${root}/static/${name}`, "");
  }
  return root;
}

/** Stands in for the CLI: `pack` creates the bundle, and `failOn` fails. */
function fakeMcpb(failOn?: string) {
  const calls: string[] = [];
  const run = async (...args: string[]): Promise<void> => {
    const command = args[0] ?? "";
    calls.push(command);
    if (command === "pack") await Deno.writeTextFile(args[2] ?? "", "bundle");
    if (command === failOn) throw new Error(`${command} failed`);
  };
  return { calls, run };
}

async function exists(path: string): Promise<boolean> {
  return await Deno.stat(path).catch(() => null) !== null;
}

async function assertNothingStaged(root: string): Promise<void> {
  for (const name of ["dist/manifest.json", "dist/icon.png", "dist/server/launch.sh"]) {
    assert(!await exists(`${root}/${name}`), `${name} was left behind`);
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

Deno.test("packBundle validates and packs, then clears the staged files", async () => {
  const root = await project();
  try {
    const { calls, run } = fakeMcpb();
    assertEquals(await packBundle(root, run), `${root}/dist/server.mcpb`);
    assertEquals(calls.join(), "--version,validate,pack");
    assert(await exists(`${root}/dist/server.mcpb`), "no bundle");
    await assertNothingStaged(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("packBundle leaves no partial bundle when packing fails", async () => {
  const root = await project();
  try {
    const message = await failure(packBundle(root, fakeMcpb("pack").run));
    assert(message.includes("pack failed"), message);
    assert(!await exists(`${root}/dist/server.mcpb`), "partial bundle left behind");
    await assertNothingStaged(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("packBundle clears the staged files when a copy fails", async () => {
  const root = await project();
  try {
    await Deno.remove(`${root}/static/mcpb-launcher.sh`);
    const message = await failure(packBundle(root, fakeMcpb().run));
    assert(message.includes("mcpb-launcher.sh"), message);
    await assertNothingStaged(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("packBundle names a missing binary and a missing CLI", async () => {
  const root = await project();
  try {
    await Deno.remove(`${root}/dist/server/server.exe`);
    assert((await failure(packBundle(root, fakeMcpb().run))).includes("server.exe"));
    assert((await failure(packBundle(root, fakeMcpb("--version").run))).includes("npm install"));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
