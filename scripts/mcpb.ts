#!/usr/bin/env -S deno run --allow-read=. --allow-write=dist --allow-run=mcpb

/**
 * @description Bundles the compiled server in `dist/` as an MCP Bundle (`dist/server.mcpb`)
 * @author      P. Hughes <github@phugh.es>
 * @license     MIT
 * @module
 */

const BINARIES = [
  "server.exe",
  "server_mac_arm64",
  "server_mac_x64",
  "server_linux_x64",
  "server_linux_arm64",
];

export type RunMcpb = (...args: string[]) => Promise<void>;

async function mcpb(...args: string[]): Promise<void> {
  const { code } = await new Deno.Command("mcpb", { args }).spawn().status;
  if (code !== 0) throw new Error(`\`mcpb ${args[0]}\` exited with code ${code}`);
}

async function removeIfPresent(path: string): Promise<void> {
  await Deno.remove(path).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
}

/** Leaves `dist/server.mcpb` only if it was packed and signed, and no staged files either way. */
export async function packBundle(root = ".", run: RunMcpb = mcpb): Promise<string> {
  const dist = `${root}/dist`;
  const bundle = `${dist}/server.mcpb`;
  const manifest = `${dist}/manifest.json`;
  const icon = `${dist}/icon.png`;
  const launcher = `${dist}/server/launch.sh`;

  await run("--version").catch(() => {
    throw new Error("mcpb is not installed, run `npm install -g @anthropic-ai/mcpb`");
  });

  const info = await Deno.stat(dist).catch(() => null);
  if (!info?.isDirectory) throw new Error("dist/ not found, run `deno task compile:all` first");

  for (const name of BINARIES) {
    await Deno.stat(`${dist}/server/${name}`).catch(() => {
      throw new Error(`dist/server/${name} is missing, run \`deno task compile:all\` first`);
    });
  }

  await removeIfPresent(bundle);
  try {
    await Deno.copyFile(`${root}/static/mcpb-manifest.json`, manifest);
    await Deno.copyFile(`${root}/static/icon.png`, icon);
    await Deno.copyFile(`${root}/static/mcpb-launcher.sh`, launcher);
    await run("validate", manifest);
    await run("pack", dist, bundle);
    await run("sign", bundle, "--self-signed");
  } catch (error) {
    await removeIfPresent(bundle);
    throw error;
  } finally {
    await removeIfPresent(launcher);
    await removeIfPresent(icon);
    await removeIfPresent(manifest);
  }
  return bundle;
}

if (import.meta.main) {
  console.log(`MCP Bundle ${await packBundle()} created`);
}
