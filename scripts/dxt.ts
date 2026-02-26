#!/usr/bin/env -S deno run -A

/**
 * @description Script to bundle the app as a DXT package
 * @author      P. Hughes <github@phugh.es>
 * @license     MIT
 * @module
 */

async function main() {
  // check if dxt is installed
  const dxt = new Deno.Command("dxt", { args: ["--version"] });
  const child = dxt.spawn();
  const output = await child.output();
  if (output.code !== 0) {
    console.error("dxt is not installed, run `npm install -g @anthropic-ai/dxt` to install it");
    Deno.exit(1);
  }

  // check if dist directory exists
  await Deno.stat("./dist").then((stat) => {
    if (!stat.isDirectory) {
      console.error("Dist directory does not exist, run one of the `compile` tasks first");
      Deno.exit(1);
    }
  }).catch((error) => {
    console.error("Error checking dist directory", error);
    Deno.exit(1);
  });

  // copy dxt-manifest.json to dist
  await Deno.copyFile("./static/dxt-manifest.json", "./dist/manifest.json").catch((error) => {
    console.error("Error copying manifest.json", error);
    Deno.exit(1);
  });

  // copy icon.png to dist
  await Deno.copyFile("./static/icon.png", "./dist/icon.png").catch((error) => {
    console.error("Error copying icon.png", error);
    Deno.exit(1);
  });

  // check if server.dxt exists
  const exists = await Deno.stat("./dist/server.dxt").then((stat) => stat.isFile).catch((error) => {
    console.error("Error checking if server.dxt exists", error);
    return false;
  });

  // if server.dxt exists, remove it
  if (exists) {
    await Deno.remove("./dist/server.dxt").catch((error) => {
      console.error("Error removing server.dxt", error);
      Deno.exit(1);
    });
  }

  // run `dxt pack` to create the DXT package
  const command = new Deno.Command("dxt", {
    args: ["pack", "./dist", "./dist/server.dxt"],
  });
  const result = command.spawn();
  await result.output().catch((error) => {
    console.error("Error running dxt pack", error);
    Deno.exit(1);
  });

  // run `dxt sign` to sign the DXT package
  const signCommand = new Deno.Command("dxt", {
    args: ["sign", "./dist/server.dxt"],
  });
  const signResult = signCommand.spawn();
  await signResult.output().catch((error) => {
    console.error("Error running dxt sign", error);
  });

  // cleanup
  await Deno.remove("./dist/icon.png").catch((error) => {
    console.error("Error removing icon.png", error);
  });
  await Deno.remove("./dist/manifest.json").catch((error) => {
    console.error("Error removing manifest.json", error);
  });

  console.log("DXT package `./dist/server.dxt` created successfully");
}

if (import.meta.main) {
  await main();
  Deno.exit(0);
}
