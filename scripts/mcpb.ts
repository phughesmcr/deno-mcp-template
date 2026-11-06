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

async function mcpb(...args: string[]): Promise<void> {
  const { code } = await new Deno.Command("mcpb", { args }).spawn().status;
  if (code !== 0) throw new Error(`\`mcpb ${args[0]}\` exited with code ${code}`);
}

async function main(): Promise<void> {
  await mcpb("--version").catch(() => {
    throw new Error("mcpb is not installed, run `npm install -g @anthropic-ai/mcpb`");
  });

  const dist = await Deno.stat(DIST).catch(() => null);
  if (!dist?.isDirectory) throw new Error("dist/ not found, run one of the `compile` tasks first");

  await Deno.remove(BUNDLE).catch(() => {});
  await Deno.copyFile("./static/mcpb-manifest.json", MANIFEST);
  await Deno.copyFile("./static/icon.png", ICON);
  try {
    await mcpb("validate", MANIFEST);
    await mcpb("pack", DIST, BUNDLE);
    await mcpb("sign", BUNDLE, "--self-signed");
  } finally {
    await Deno.remove(ICON);
    await Deno.remove(MANIFEST);
  }

  console.log(`MCP Bundle ${BUNDLE} created`);
}

if (import.meta.main) {
  await main();
}
