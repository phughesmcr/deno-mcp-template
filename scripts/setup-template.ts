#!/usr/bin/env -S deno run --allow-read=. --allow-write=. --allow-run=git,deno --allow-env=MCP_SETUP_NON_INTERACTIVE,SETUP_AUTHOR_NAME,SETUP_AUTHOR_EMAIL,SETUP_GITHUB_USERNAME,SETUP_PROJECT_NAME,SETUP_DISPLAY_NAME,SETUP_DESCRIPTION,SETUP_JSR_SCOPE,SETUP_URL

/**
 * @description Setup script to customize the template for new projects
 * @author      P. Hughes <github@phugh.es>
 * @license     MIT
 *
 * This script helps users quickly customize the template by replacing
 * placeholder values with their own project information. `.github/workflows/setup.yml`
 * checks the result still passes `deno task ci`.
 *
 * Non-interactive: `MCP_SETUP_NON_INTERACTIVE=1` or `--non-interactive`, plus
 * required `--flag` or `SETUP_*` env vars (see `--help`).
 *
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";
import { fromFileUrl, join } from "@std/path";

export interface ProjectInfo {
  authorName: string;
  authorEmail: string;
  projectName: string;
  projectDisplayName: string;
  projectDescription: string;
  githubUsername: string;
  jsrScope?: string;
  url?: string;
}

export interface SetupCliOptions {
  help: boolean;
  yes: boolean;
  nonInteractive: boolean;
  allowDirty: boolean;
  flags: Record<string, unknown>;
}

interface Field {
  key: keyof ProjectInfo;
  flag: string;
  env: string;
  label: string;
  question: string;
  fallback?: string;
  optional?: boolean;
}

const FIELDS: readonly Field[] = [
  {
    key: "authorName",
    flag: "author-name",
    env: "SETUP_AUTHOR_NAME",
    label: "author name",
    question: "Your full name",
    fallback: "Your Name",
  },
  {
    key: "authorEmail",
    flag: "author-email",
    env: "SETUP_AUTHOR_EMAIL",
    label: "author email",
    question: "Your email address",
    fallback: "you@example.com",
  },
  {
    key: "githubUsername",
    flag: "github-username",
    env: "SETUP_GITHUB_USERNAME",
    label: "GitHub username",
    question: "Your GitHub username",
  },
  {
    key: "projectName",
    flag: "project-name",
    env: "SETUP_PROJECT_NAME",
    label: "project name",
    question: "Project name (kebab-case)",
    fallback: "my-mcp-server",
  },
  {
    key: "projectDisplayName",
    flag: "display-name",
    env: "SETUP_DISPLAY_NAME",
    label: "display name",
    question: "Project display name",
    fallback: "My MCP Server",
  },
  {
    key: "projectDescription",
    flag: "description",
    env: "SETUP_DESCRIPTION",
    label: "description",
    question: "Project description",
    fallback: "My custom MCP server",
  },
  {
    key: "jsrScope",
    flag: "jsr-scope",
    env: "SETUP_JSR_SCOPE",
    label: "JSR scope",
    question: "JSR scope (optional, will use GitHub username if empty)",
    optional: true,
  },
  {
    key: "url",
    flag: "url",
    env: "SETUP_URL",
    label: "URL",
    question: "Project URL (optional, defaults to GitHub repo URL if empty)",
    optional: true,
  },
];

const PROJECT_DESCRIPTION_CANONICAL = "A template for building MCP servers with Deno.";
const INITIAL_VERSION = "0.1.0";

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GITHUB_USERNAME = /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i;
const EMAIL = /^[^\s@"\\]+@[^\s@"\\]+$/;
const WEB_URL = /^https?:\/\/[^\s"\\]+$/;
/** These end up inside JSON and TypeScript strings. */
const UNSAFE_TEXT = /["\\\p{Cc}]/u;
/** The display name is also a plain YAML scalar in `openapi.yaml`, where `: ` or ` #` would break it. */
const DISPLAY_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'&+()-]*$/u;

/** Replaced in order: longest first, so `phughesmcr` can't break up a longer match. */
export function buildReplacements(
  info: ProjectInfo,
  version: string,
): Array<{ find: string; replace: string }> {
  return [
    {
      find: `"homepage": "https://github.com/phughesmcr/deno-mcp-template"`,
      replace: `"homepage": "${effectivePublicUrl(info)}"`,
    },
    { find: "@phughesmcr/deno-mcp-template", replace: jsrId(info) },
    { find: "P. Hughes", replace: info.authorName },
    { find: "github@phugh.es", replace: info.authorEmail },
    { find: "phughesmcr", replace: info.githubUsername },
    { find: "deno-mcp-template", replace: info.projectName },
    { find: "Deno MCP Server Template", replace: info.projectDisplayName },
    { find: "Deno MCP Template", replace: info.projectDisplayName },
    { find: PROJECT_DESCRIPTION_CANONICAL, replace: info.projectDescription },
    { find: `"version": "${version}"`, replace: `"version": "${INITIAL_VERSION}"` },
    { find: `\n  version: ${version}\n`, replace: `\n  version: ${INITIAL_VERSION}\n` },
  ];
}

/** Literal replacement: a function replacer keeps `$&` and friends out of the new text. */
export function applyReplacements(
  content: string,
  replacements: ReadonlyArray<{ find: string; replace: string }>,
): string {
  return replacements.reduce(
    (text, { find, replace }) => text.replaceAll(find, () => replace),
    content,
  );
}

/** `deno task strip` deletes these, so they may be missing. */
const REMOVED_BY_STRIP: ReadonlySet<string> = new Set(["src/mcp/apps/fetchWebsiteInfoApp.ts"]);

export const FILES_TO_UPDATE: readonly string[] = [
  ".agents/skills/implementing-mcp-prompts/SKILL.md",
  ".agents/skills/implementing-mcp-resources/SKILL.md",
  ".agents/skills/implementing-mcp-tools/SKILL.md",
  ".env.example",
  ".github/CODEOWNERS",
  ".github/FUNDING.yml",
  "src/shared/constants/app.ts",
  "src/mcp/apps/fetchWebsiteInfoApp.ts",
  "static/.well-known/llms.txt",
  "static/.well-known/openapi.yaml",
  "static/mcpb-manifest.json",
  "AGENTS.md",
  ".github/CONTRIBUTING.md",
  "deno.json",
  "LICENSE",
  "README.md",
  ".github/SECURITY.md",
  "scripts/clean-dist.ts",
  "scripts/mcpb.ts",
];

/** Removed once setup succeeds: they only make sense on the unconfigured template. */
const SETUP_FILES: readonly string[] = [
  ".github/workflows/setup.yml",
  "__test__/setup-template.test.ts",
  "scripts/setup-template.ts",
];

function changelog(): string {
  return `# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased
`;
}

function effectivePublicUrl(info: ProjectInfo): string {
  return info.url || `https://github.com/${info.githubUsername}/${info.projectName}`;
}

/** JSR scopes are lowercase, whereas GitHub usernames need not be. */
function jsrId(info: ProjectInfo): string {
  return `@${info.jsrScope || info.githubUsername.toLowerCase()}/${info.projectName}`;
}

export function parseSetupCli(args: string[]): SetupCliOptions {
  const flags = parseArgs(args, {
    boolean: ["help", "yes", "non-interactive", "allow-dirty"],
    string: FIELDS.map(({ flag }) => flag),
    alias: { h: "help", y: "yes" },
    unknown: (arg) => {
      throw new Error(`Unknown option: ${arg}. See --help.`);
    },
  });
  const envNi = Deno.env.get("MCP_SETUP_NON_INTERACTIVE");
  return {
    help: flags.help,
    yes: flags.yes,
    nonInteractive: flags["non-interactive"] || envNi === "1" || envNi === "true",
    allowDirty: flags["allow-dirty"],
    flags,
  };
}

/** Every problem at once, so a non-interactive run needs only one retry. */
export function validateProjectInfo(info: ProjectInfo): void {
  const problems: string[] = [];
  if (!GITHUB_USERNAME.test(info.githubUsername)) {
    problems.push(`GitHub username is not valid: "${info.githubUsername}"`);
  }
  if (!KEBAB_CASE.test(info.projectName)) {
    problems.push(
      `Project name must be kebab-case (lowercase letters, digits, single hyphens): got "${info.projectName}"`,
    );
  }
  if (!EMAIL.test(info.authorEmail)) problems.push(`Email is not valid: "${info.authorEmail}"`);
  if (!DISPLAY_NAME.test(info.projectDisplayName)) {
    problems.push(
      `Display name may use letters, digits, spaces and . _ ' & + ( ) -: got "${info.projectDisplayName}"`,
    );
  }
  for (
    const [label, value] of [
      ["Author name", info.authorName],
      ["Description", info.projectDescription],
    ] as const
  ) {
    if (!value) problems.push(`${label} is required.`);
    if (UNSAFE_TEXT.test(value)) {
      problems.push(`${label} must not contain ", \\ or control characters.`);
    }
  }
  if (info.jsrScope && !KEBAB_CASE.test(info.jsrScope)) {
    problems.push(`JSR scope must be lowercase kebab-case: got "${info.jsrScope}"`);
  }
  if (info.url && !WEB_URL.test(info.url)) {
    problems.push(`URL must be http(s) with no spaces or quotes: got "${info.url}"`);
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
}

function promptUser(question: string, defaultValue?: string): string {
  const promptText = defaultValue ? `${question} (${defaultValue})` : question;
  const answer = prompt(promptText + ":");
  return answer?.trim() || defaultValue || "";
}

/** Flags and `SETUP_*` vars are the values in non-interactive mode, and prompt defaults otherwise. */
export function collectProjectInfo(
  cli: SetupCliOptions,
  ask: (question: string, defaultValue?: string) => string = promptUser,
): ProjectInfo {
  const values: Partial<Record<keyof ProjectInfo, string>> = {};
  if (!cli.nonInteractive) console.log("🚀 Setting up your MCP server template...\n");
  for (const { key, flag, env, label, question, fallback, optional } of FIELDS) {
    const flagged = cli.flags[flag];
    const given = (typeof flagged === "string" ? flagged.trim() : "") ||
      (Deno.env.get(env)?.trim() ?? "");
    if (cli.nonInteractive && !given && !optional) {
      throw new Error(`Non-interactive setup: missing ${label}. Pass --${flag} or set ${env}.`);
    }
    const value = cli.nonInteractive ? given : ask(question, given || fallback);
    if (value) values[key] = value;
  }
  const info: ProjectInfo = {
    authorName: "",
    authorEmail: "",
    githubUsername: "",
    projectName: "",
    projectDisplayName: "",
    projectDescription: "",
    ...values,
  };
  validateProjectInfo(info);
  return info;
}

function printHelp(): void {
  console.log(`deno-mcp-template setup — replace template placeholders with your project identity.

Usage:
  deno task setup [options]

Options:
  -h, --help              Show this help
  -y, --yes               Skip confirmation prompt
  --allow-dirty           Run with uncommitted changes (setup cannot be undone without git)
  --non-interactive       Read all values from flags / env (no prompts)
                          Also enabled by MCP_SETUP_NON_INTERACTIVE=1 or true

Without --non-interactive, these are the defaults for the prompts:
  --author-name=...       Or SETUP_AUTHOR_NAME
  --author-email=...      Or SETUP_AUTHOR_EMAIL
  --github-username=...   Or SETUP_GITHUB_USERNAME
  --project-name=...      Or SETUP_PROJECT_NAME (kebab-case)
  --display-name=...      Or SETUP_DISPLAY_NAME
  --description=...       Or SETUP_DESCRIPTION
  --jsr-scope=...         Or SETUP_JSR_SCOPE (optional; default: GitHub username)
  --url=...               Or SETUP_URL (optional; deno.json homepage, shown as the server's
                          website; default: https://github.com/<user>/<repo>)
`);
}

/**
 * Every file's new content, in memory. Throws before anything is written if a file is missing or
 * a JSON file would no longer parse.
 * @returns Only the files that change
 */
export async function planUpdates(info: ProjectInfo, root = "."): Promise<Map<string, string>> {
  const { version } = JSON.parse(await Deno.readTextFile(join(root, "deno.json")));
  const replacements = buildReplacements(info, version);
  const plan = new Map<string, string>();
  const missing: string[] = [];
  for (const path of FILES_TO_UPDATE) {
    let before: string;
    try {
      before = await Deno.readTextFile(join(root, path));
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
      if (!REMOVED_BY_STRIP.has(path)) missing.push(path);
      continue;
    }
    const after = applyReplacements(before, replacements);
    if (path.endsWith(".json")) JSON.parse(after);
    if (after !== before) plan.set(path, after);
  }
  if (missing.length > 0) throw new Error(`Missing files: ${missing.join(", ")}`);
  plan.set("CHANGELOG.md", changelog());
  return plan;
}

/** @returns The files that could not be written */
export async function writeUpdates(plan: Map<string, string>, root = "."): Promise<string[]> {
  const failed: string[] = [];
  for (const [path, content] of plan) {
    try {
      await Deno.writeTextFile(join(root, path), content);
      console.log(`✅ Updated ${path}`);
    } catch (error) {
      console.error(`❌ Error updating ${path}:`, error);
      failed.push(path);
    }
  }
  return failed;
}

export async function removeSetupFiles(root = "."): Promise<void> {
  const configPath = join(root, "deno.json");
  const config = JSON.parse(await Deno.readTextFile(configPath));
  delete config.tasks?.setup;
  await Deno.writeTextFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  for (const path of SETUP_FILES) {
    await Deno.remove(join(root, path)).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    });
  }
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

function printSummary(info: ProjectInfo): void {
  console.log("\n📋 Project Information:");
  console.log(`   Name: ${info.projectName}`);
  console.log(`   Author: ${info.authorName} <${info.authorEmail}>`);
  console.log(`   Description: ${info.projectDescription}`);
  console.log(`   GitHub: ${info.githubUsername}`);
  console.log(`   JSR: ${jsrId(info)}`);
  console.log(`   Public URL: ${effectivePublicUrl(info)}`);
}

function printNextSteps(): void {
  console.log("\n🎉 Template setup complete!");
  console.log("\nNext steps:");
  console.log("1. Review the updated files and the rest of the repo.");
  console.log("2. Update the files in static/.well-known to reflect your server.");
  console.log(
    "3. Set DENO_DEPLOY_TOKEN (secret) and DENO_DEPLOY_ORG / DENO_DEPLOY_APP (repository variables)",
  );
  console.log("4. Run `deno task ci` to check the code, then commit.");
  console.log("5. Run `deno task strip` if you don't want the example features.");
  console.log("6. Start coding your MCP server!");
}

async function main(): Promise<number> {
  const cli = parseSetupCli(Deno.args);
  if (cli.help) {
    printHelp();
    return 0;
  }
  Deno.chdir(fromFileUrl(new URL("../", import.meta.url)));

  if (!cli.allowDirty && !await isCleanGitTree()) {
    console.error("❌ Run this in a git repository with everything committed, so you can undo it.");
    console.error("   Or pass --allow-dirty.");
    return 1;
  }

  const info = collectProjectInfo(cli);
  printSummary(info);

  if (!cli.nonInteractive && !cli.yes) {
    const answer = promptUser("\nProceed with setup? (y/N)", "N").toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log("Setup cancelled.");
      return 0;
    }
  }

  console.log("\n📝 Updating files...\n");
  const failed = await writeUpdates(await planUpdates(info));

  // New names can change line lengths, which `deno task ci` would otherwise reject.
  const { success: formatted } = await new Deno.Command(Deno.execPath(), {
    args: ["fmt", "--quiet"],
  }).spawn().status;

  if (failed.length > 0 || !formatted) {
    console.error(
      `\n❌ Setup is incomplete. ${
        failed.length > 0 ? `Not updated: ${failed.join(", ")}.` : "`deno fmt` failed."
      }`,
    );
    console.error("   Fix that, then run `deno task setup --allow-dirty` again.");
    return 1;
  }

  await removeSetupFiles();
  printNextSteps();
  return 0;
}

if (import.meta.main) {
  try {
    Deno.exitCode = await main();
  } catch (error) {
    console.error("❌ Setup failed:", error instanceof Error ? error.message : error);
    Deno.exitCode = 1;
  }
}
