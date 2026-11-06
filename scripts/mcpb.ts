#!/usr/bin/env -S deno run -A

/**
 * @description Bundles the compiled server in `dist/` as an MCP Bundle (`dist/server.mcpb`)
 * @author      P. Hughes <github@phugh.es>
 * @license     MIT
 * @module
 */

const DIST = "./dist";
const BUNDLE = `${DIST}/server.mcpb`;
const MANIFEST = `${DIST}/manifest.json`;
const ICON = `${DIST}/icon.png`;
const LAUNCHER = `${DIST}/server/launch.sh`;
const BINARIES = [
  "server.exe",
  "server_mac_arm64",
  "server_mac_x64",
  "server_linux_x64",
  "server_linux_arm64",
];

async function mcpb(...args: string[]): Promise<void> {
  const { code } = await new Deno.Command("mcpb", { args }).spawn().status;
  if (code !== 0) throw new Error(`\`mcpb ${args[0]}\` exited with code ${code}`);
}

async function main(): Promise<void> {
  await mcpb("--version").catch(() => {
    throw new Error("mcpb is not installed, run `npm install -g @anthropic-ai/mcpb`");
  });

  const dist = await Deno.stat(DIST).catch(() => null);
  if (!dist?.isDirectory) throw new Error("dist/ not found, run `deno task compile:all` first");

  for (const name of BINARIES) {
    await Deno.stat(`${DIST}/server/${name}`).catch(() => {
      throw new Error(`dist/server/${name} is missing, run \`deno task compile:all\` first`);
    });
  }

  await Deno.remove(BUNDLE).catch(() => {});
  await Deno.copyFile("./static/mcpb-manifest.json", MANIFEST);
  await Deno.copyFile("./static/icon.png", ICON);
  await Deno.copyFile("./static/mcpb-launcher.sh", LAUNCHER);
  try {
    await mcpb("validate", MANIFEST);
    await mcpb("pack", DIST, BUNDLE);
    await mcpb("sign", BUNDLE, "--self-signed");
  } finally {
    await Deno.remove(LAUNCHER);
    await Deno.remove(ICON);
    await Deno.remove(MANIFEST);
  }

  console.log(`MCP Bundle ${BUNDLE} created`);
}

if (import.meta.main) {
  await main();
}
