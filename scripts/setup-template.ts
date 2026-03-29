#!/usr/bin/env -S deno run -A

/**
 * @description Setup script to customize the template for new projects
 * @author      P. Hughes <github@phugh.es>
 * @license     MIT
 *
 * This script helps users quickly customize the template by replacing
 * placeholder values with their own project information.
 *
 * Non-interactive: `MCP_SETUP_NON_INTERACTIVE=1` or `--non-interactive`, plus
 * required `--flag` or `SETUP_*` env vars (see `--help`).
 *
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";

interface ProjectInfo {
  authorName: string;
  authorEmail: string;
  projectName: string;
  projectDisplayName: string;
  projectDescription: string;
  githubUsername: string;
  jsrScope?: string;
  denoDeployApp?: string;
  url?: string;
}

interface SetupCliOptions {
  help: boolean;
  yes: boolean;
  nonInteractive: boolean;
}

const PROJECT_DESCRIPTION_CANONICAL = "A template for building MCP servers with Deno.";

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Apply in order: full JSR id before bare `phughesmcr` / `deno-mcp-template`. */
function buildReplacements(info: ProjectInfo): Array<{ find: string; replace: string }> {
  const jsrId = `@${info.jsrScope?.trim() || info.githubUsername}/${info.projectName}`;
  const publicUrl = effectivePublicUrl(info);
  return [
    { find: "@phughesmcr/deno-mcp-template", replace: jsrId },
    { find: "P. Hughes", replace: info.authorName },
    { find: "github@phugh.es", replace: info.authorEmail },
    { find: "phughesmcr", replace: info.githubUsername },
    { find: "deno-mcp-template", replace: info.projectName },
    { find: "Deno MCP Template", replace: info.projectDisplayName },
    { find: PROJECT_DESCRIPTION_CANONICAL, replace: info.projectDescription },
    { find: "https://www.phugh.es", replace: publicUrl },
  ];
}

const FILES_TO_UPDATE = [
  ".github/workflows/deploy.yml",
  ".github/CODEOWNERS",
  ".github/FUNDING.yml",
  "src/shared/constants/app.ts",
  "src/mcp/apps/fetchWebsiteInfoApp.ts",
  "static/.well-known/llms.txt",
  "static/.well-known/openapi.yaml",
  "static/dxt-manifest.json",
  "AUTHORS.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "deno.json",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "scripts/clean-dist.ts",
  "scripts/dxt.ts",
];

function effectivePublicUrl(info: ProjectInfo): string {
  const trimmed = info.url?.trim();
  if (trimmed) return trimmed;
  return `https://github.com/${info.githubUsername}/${info.projectName}`;
}

function parseSetupCli(): SetupCliOptions & { parsed: ReturnType<typeof parseArgs> } {
  const parsed = parseArgs(Deno.args, {
    boolean: ["help", "yes", "non-interactive"],
    string: [
      "author-name",
      "author-email",
      "github-username",
      "project-name",
      "display-name",
      "description",
      "jsr-scope",
      "url",
      "deno-deploy-app",
    ],
    alias: { h: "help", y: "yes" },
  });
  const envNi = Deno.env.get("MCP_SETUP_NON_INTERACTIVE");
  const nonInteractive = Boolean(parsed["non-interactive"]) ||
    envNi === "1" ||
    envNi === "true";
  return {
    help: Boolean(parsed.help),
    yes: Boolean(parsed.yes),
    nonInteractive,
    parsed,
  };
}

function str(parsed: ReturnType<typeof parseArgs>, key: string): string {
  const v = parsed[key];
  return typeof v === "string" ? v.trim() : "";
}

function pick(
  parsed: ReturnType<typeof parseArgs>,
  flagKey: string,
  envKey: string,
  nonInteractive: boolean,
  label: string,
  required: boolean,
): string {
  const fromFlag = str(parsed, flagKey);
  const fromEnv = Deno.env.get(envKey)?.trim() ?? "";
  const v = fromFlag || fromEnv;
  if (required && nonInteractive && !v) {
    throw new Error(
      `Non-interactive setup: missing ${label}. Pass --${flagKey} or set ${envKey}.`,
    );
  }
  return v;
}

function validateProjectIdentity(info: ProjectInfo): void {
  if (!info.githubUsername.trim()) {
    throw new Error("GitHub username is required.");
  }
  if (!KEBAB_CASE.test(info.projectName)) {
    throw new Error(
      `Project name must be kebab-case (lowercase letters, digits, single hyphens): got "${info.projectName}"`,
    );
  }
}

function collectProjectInfo(
  cli: SetupCliOptions,
  parsed: ReturnType<typeof parseArgs>,
): ProjectInfo {
  if (cli.nonInteractive) {
    const authorName = pick(parsed, "author-name", "SETUP_AUTHOR_NAME", true, "author name", true);
    const authorEmail = pick(
      parsed,
      "author-email",
      "SETUP_AUTHOR_EMAIL",
      true,
      "author email",
      true,
    );
    const githubUsername = pick(
      parsed,
      "github-username",
      "SETUP_GITHUB_USERNAME",
      true,
      "GitHub username",
      true,
    );
    const projectName = pick(
      parsed,
      "project-name",
      "SETUP_PROJECT_NAME",
      true,
      "project name",
      true,
    );
    const projectDisplayName = pick(
      parsed,
      "display-name",
      "SETUP_DISPLAY_NAME",
      true,
      "display name",
      true,
    );
    const projectDescription = pick(
      parsed,
      "description",
      "SETUP_DESCRIPTION",
      true,
      "description",
      true,
    );
    const jsrScope = pick(parsed, "jsr-scope", "SETUP_JSR_SCOPE", true, "JSR scope", false);
    const url = pick(parsed, "url", "SETUP_URL", true, "URL", false);
    const denoDeployApp = pick(
      parsed,
      "deno-deploy-app",
      "SETUP_DENO_DEPLOY_APP",
      true,
      "Deno Deploy app name",
      false,
    );
    const info: ProjectInfo = {
      authorName,
      authorEmail,
      githubUsername,
      projectName,
      projectDisplayName,
      projectDescription,
      jsrScope: jsrScope || undefined,
      url: url || undefined,
      denoDeployApp: denoDeployApp || undefined,
    };
    validateProjectIdentity(info);
    return info;
  }

  console.log("🚀 Setting up your MCP server template...\n");

  const authorName = promptUser("Your full name", "Your Name");
  const authorEmail = promptUser("Your email address", "you@example.com");
  let githubUsername = promptUser("Your GitHub username");
  let projectName = promptUser("Project name (kebab-case)", "my-mcp-server");
  const projectDisplayName = promptUser("Project display name", "My MCP Server");
  const projectDescription = promptUser("Project description", "My custom MCP server");
  const jsrRaw = promptUser("JSR scope (optional, will use GitHub username if empty)");
  const urlRaw = promptUser("Project URL (optional, defaults to GitHub repo URL if empty)");
  const denoDeployRaw = promptUser(
    "Deno Deploy app name (optional, matches repository variable DENO_DEPLOY_APP)",
    "",
  );

  githubUsername = githubUsername.trim();
  projectName = projectName.trim();
  const info: ProjectInfo = {
    authorName: authorName.trim(),
    authorEmail: authorEmail.trim(),
    githubUsername,
    projectName,
    projectDisplayName: projectDisplayName.trim(),
    projectDescription: projectDescription.trim(),
    jsrScope: jsrRaw.trim() || undefined,
    url: urlRaw.trim() || undefined,
    denoDeployApp: denoDeployRaw.trim() || undefined,
  };
  validateProjectIdentity(info);
  return info;
}

function promptUser(question: string, defaultValue?: string): string {
  const promptText = defaultValue !== undefined ? `${question} (${defaultValue})` : question;
  const answer = prompt(promptText + ":");
  return answer?.trim() || defaultValue || "";
}

function printHelp(): void {
  console.log(`deno-mcp-template setup — replace template placeholders with your project identity.

Usage:
  deno task setup
  deno run -A scripts/setup-template.ts [options]

Options:
  -h, --help              Show this help
  -y, --yes               Skip confirmation prompt
  --non-interactive       Read all values from flags / env (no prompts)
                          Also enabled by MCP_SETUP_NON_INTERACTIVE=1 or true

  --author-name=...       Or SETUP_AUTHOR_NAME
  --author-email=...      Or SETUP_AUTHOR_EMAIL
  --github-username=...    Or SETUP_GITHUB_USERNAME
  --project-name=...      Or SETUP_PROJECT_NAME (kebab-case)
  --display-name=...      Or SETUP_DISPLAY_NAME
  --description=...       Or SETUP_DESCRIPTION
  --jsr-scope=...         Or SETUP_JSR_SCOPE (optional; default: GitHub username)
  --url=...               Or SETUP_URL (optional; default: https://github.com/<user>/<repo>)
  --deno-deploy-app=...   Or SETUP_DENO_DEPLOY_APP (optional; for DENO_DEPLOY_APP docs)
`);
}

async function updateFile(filePath: string, info: ProjectInfo): Promise<void> {
  const replacements = buildReplacements(info);
  try {
    let content = await Deno.readTextFile(filePath);
    let updated = false;

    for (const { find, replace } of replacements) {
      if (content.includes(find)) {
        content = content.replaceAll(find, replace);
        updated = true;
      }
    }

    if (updated) {
      await Deno.writeTextFile(filePath, content);
      console.log(`✅ Updated ${filePath}`);
    } else {
      console.log(`✅ No updates needed for ${filePath}`);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(`⚠️ File not found: ${filePath}`);
    } else {
      console.error(`❌ Error updating ${filePath}:`, error);
    }
  }
}

async function updateAllFiles(info: ProjectInfo): Promise<void> {
  console.log("\n📝 Updating files...\n");
  for (const pattern of FILES_TO_UPDATE) {
    await updateFile(pattern, info);
  }
}

async function cleanup(): Promise<void> {
  const raw = await Deno.readTextFile("deno.json");
  const data = JSON.parse(raw) as { tasks?: Record<string, unknown> };
  if (data.tasks && "setup" in data.tasks) {
    delete data.tasks.setup;
  }
  await Deno.writeTextFile("deno.json", JSON.stringify(data, null, 4) + "\n");
  await Deno.remove("scripts/setup-template.ts");
}

async function main(): Promise<boolean> {
  const cli = parseSetupCli();
  if (cli.help) {
    printHelp();
    return false;
  }

  try {
    const info = collectProjectInfo(cli, cli.parsed);

    console.log("\n📋 Project Information:");
    console.log(`   Name: ${info.projectName}`);
    console.log(`   Author: ${info.authorName} <${info.authorEmail}>`);
    console.log(`   Description: ${info.projectDescription}`);
    console.log(`   GitHub: ${info.githubUsername}`);
    console.log(`   JSR: @${info.jsrScope?.trim() || info.githubUsername}/${info.projectName}`);
    console.log(`   Public URL: ${effectivePublicUrl(info)}`);
    if (info.denoDeployApp) {
      console.log(`   Deno Deploy app (DENO_DEPLOY_APP): ${info.denoDeployApp}`);
    }

    if (!cli.nonInteractive) {
      const confirm = cli.yes ? "y" : promptUser("\nProceed with setup? (y/N)", "N");
      if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
        console.log("Setup cancelled.");
        return false;
      }
    }

    await updateAllFiles(info);

    console.log("\n🎉 Template setup complete!");
    console.log("\nNext steps:");
    console.log("1. Review the updated files and the rest of the repo.");
    console.log("2. Update the files in static/.well-known to reflect your server.");
    console.log(
      "3. Set DENO_DEPLOY_TOKEN (secret) and DENO_DEPLOY_ORG / DENO_DEPLOY_APP (repository variables)",
    );
    if (info.denoDeployApp) {
      console.log(`   Set DENO_DEPLOY_APP to "${info.denoDeployApp}" if not already.`);
    }
    console.log("4. Run `deno task ci` to format and check the code");
    console.log("5. Start coding your MCP server!");
    return true;
  } catch (error) {
    console.error("❌ Setup failed:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  const ok = await main();
  if (ok) {
    await cleanup();
  }
}
