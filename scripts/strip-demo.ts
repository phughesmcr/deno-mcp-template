#!/usr/bin/env -S deno run -A

/**
 * @description Turns the template into a minimal server: one tool (`echo`), one resource
 * (`hello://world`), one prompt (`review-code`). Run it before adding your own features, as it
 * removes everything else in `src/mcp/{tools,resources,prompts}/`. `.github/workflows/strip.yml`
 * checks the result still passes `deno task ci`.
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";
import { fromFileUrl } from "@std/path";

/** Files to keep in the folders that are otherwise emptied. */
const KEEP: Readonly<Record<string, readonly string[]>> = {
  "src/mcp/tools": ["echo.ts", "mod.ts"],
  "src/mcp/resources": ["helloWorld.ts", "kvKeys.ts", "mod.ts"],
  "src/mcp/prompts": ["codeReview.ts", "mod.ts"],
};

const DELETE: readonly string[] = [
  ".github/workflows/mcp-conformance.yml",
  ".github/workflows/strip.yml",
  "__bench__/kv-performance.bench.ts",
  "__test__/conformance-showcase-default.test.ts",
  "__test__/counter-kv-persistence.integration.test.ts",
  "__test__/execute-code-sandbox.integration.test.ts",
  "__test__/mcp-fetch-website-info-app.integration.test.ts",
  "__test__/mcp-protocol-demos.integration.test.ts",
  "mcp-ui",
  "scripts/conformance-baseline.yml",
  "scripts/run-mcp-conformance.sh",
  "scripts/strip-demo.ts",
  "src/mcp/apps/fetchWebsiteInfoApp.ts",
  "src/mcp/showcase",
  "static/mcp-apps",
];

const REWRITE: Readonly<Record<string, string>> = {
  "src/mcp/tools/mod.ts": `/**
 * @description Tools: Functions that can be called by the LLM (with user approval)
 * @module
 */

import type { ToolPlugin } from "$/mcp/plugin-types.ts";
import echo from "./echo.ts";

export const tools: readonly ToolPlugin[] = [
  echo,
];
`,
  "src/mcp/resources/mod.ts": `/**
 * @description Resources: File-like data that can be read by clients (like API responses or file contents)
 * @see {@link https://modelcontextprotocol.io/docs/concepts/resources}
 * @module
 */

import type { AnyResourcePlugin } from "$/mcp/plugin-types.ts";
import helloWorld from "./helloWorld.ts";

export const resources: AnyResourcePlugin[] = [
  helloWorld,
];
`,
  "src/mcp/resources/kvKeys.ts":
    `/** Resource URIs to the KV keys watched for \`resource_updated\`. */
export const RESOURCE_KV_KEYS: ReadonlyMap<string, Deno.KvKey> = new Map();
`,
  "src/mcp/prompts/mod.ts": `/**
 * @description Prompts: Pre-written templates that help users accomplish specific tasks
 * @module
 */
import type { PromptPlugin } from "$/mcp/plugin-types.ts";
import codeReview from "./codeReview.ts";

export const prompts: readonly PromptPlugin[] = [
  codeReview,
];
`,
  "src/mcp/apps/mod.ts": `/**
 * @description MCP Apps: tools with an interactive UI that capable hosts render inline
 * @see {@link https://modelcontextprotocol.io/extensions/overview}
 * @module
 */

import type { AppPlugin } from "$/mcp/plugin-types.ts";

export const apps: readonly AppPlugin[] = [];
`,
};

const MANUAL_STEPS: readonly string[] = [
  "README.md, AGENTS.md and static/.well-known/llms.txt still describe the removed features.",
  "`.env.example` still lists DENO_DEPLOY_TOKEN for the sandbox and MCP_DOMAIN_TOOL_ALLOW_HTTP.",
  "The examples in .agents/skills/ point at removed files.",
  "`src/mcp/urlElicitation/` is kept but off: set `urlElicitation: true` to use it.",
];

/** Replaces `pattern` in the file, failing if it no longer matches. */
async function patched(path: string, pattern: RegExp, replacement: string): Promise<string> {
  const before = await Deno.readTextFile(path);
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`Nothing to change in ${path}: expected ${pattern}`);
  return after;
}

async function patchedDenoJson(): Promise<string> {
  const config = JSON.parse(await Deno.readTextFile("deno.json"));
  for (const task of ["conformance:list", "conformance:server", "build:mcp-ui", "strip"]) {
    delete config.tasks[task];
  }
  config.tasks.ci = config.tasks.ci.command;
  delete config.imports["@modelcontextprotocol/ext-apps/server"];
  delete config.imports["@deno/sandbox"];
  for (const section of [config.fmt, config.lint, config.publish]) {
    section.exclude = section.exclude.filter((path: string) => path !== "mcp-ui/");
    if (section.exclude.length === 0) delete section.exclude;
  }
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Every file's new content. Built first, so a failed patch leaves the project untouched. */
async function prepareWrites(): Promise<Record<string, string>> {
  return {
    ...REWRITE,
    "src/mcp/serverDefinition.ts": await patched(
      "src/mcp/serverDefinition.ts",
      /urlElicitation: true/,
      "urlElicitation: false",
    ),
    "static/.well-known/openapi.yaml": await patched(
      "static/.well-known/openapi.yaml",
      /^ {2}\/mcp-elicitation\/[\s\S]*?(?=^ {2}\/|^\S)/m,
      "",
    ),
    ".github/workflows/ci.yml": await patched(
      ".github/workflows/ci.yml",
      /^ +env:\n +# Enables the real sandbox test.*\n +DENO_DEPLOY_TOKEN:.*\n/m,
      "",
    ),
    "deno.json": await patchedDenoJson(),
  };
}

async function run(command: string, ...args: string[]): Promise<void> {
  const { success } = await new Deno.Command(command, { args }).output();
  if (!success) throw new Error(`\`${command} ${args.join(" ")}\` failed`);
}

async function isCleanGitTree(): Promise<boolean> {
  try {
    const { success, stdout } = await new Deno.Command("git", { args: ["status", "--porcelain"] })
      .output();
    return success && stdout.length === 0;
  } catch {
    return false;
  }
}

async function listDeletions(): Promise<string[]> {
  const paths = [...DELETE];
  for (const [dir, keep] of Object.entries(KEEP)) {
    for await (const { name } of Deno.readDir(dir)) {
      if (!keep.includes(name)) paths.push(`${dir}/${name}`);
    }
  }
  return paths.sort();
}

async function strip(deletions: readonly string[]): Promise<void> {
  const writes = await prepareWrites();
  for (const path of deletions) {
    await Deno.remove(path, { recursive: true }).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    });
  }
  for (const [path, content] of Object.entries(writes)) {
    await Deno.writeTextFile(path, content);
  }
  await run("deno", "install", "--frozen=false", "--entrypoint", "main.ts");
  await run("deno", "fmt", "--quiet");
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, { boolean: ["allow-dirty", "dry-run", "help"] });
  if (args.help) {
    console.log("Usage: deno task strip [--dry-run] [--allow-dirty]");
    return;
  }
  Deno.chdir(fromFileUrl(new URL("../", import.meta.url)));

  const deletions = await listDeletions();
  if (args["dry-run"]) {
    console.log("Would delete:");
    for (const path of deletions) console.log(`  ${path}`);
    console.log("Would rewrite:");
    for (const path of Object.keys(REWRITE)) console.log(`  ${path}`);
    return;
  }

  if (!args["allow-dirty"] && !await isCleanGitTree()) {
    console.error("❌ Run this in a git repository with everything committed, so you can undo it.");
    console.error("   Or pass --allow-dirty. Use --dry-run to see what would change.");
    Deno.exit(1);
  }

  await strip(deletions);

  console.log("✅ Stripped to `echo`, `hello://world` and `review-code`.");
  console.log("\nLeft for you:");
  for (const step of MANUAL_STEPS) console.log(`- ${step}`);
  console.log("\nRun `deno task ci` to check the result.");
}

if (import.meta.main) await main();
