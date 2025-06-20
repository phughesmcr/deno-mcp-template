#!/usr/bin/env -S deno run -A

/**
 * @description Setup script to customize the template for new projects
 * @author      P. Hughes <github@phugh.es>
 * @license     MIT
 * 
 * This script helps users quickly customize the template by replacing
 * placeholder values with their own project information.
 */

interface ProjectInfo {
  authorName: string;
  authorEmail: string;
  projectName: string;
  projectDescription: string;
  githubUsername: string;
  jsrScope?: string;
  denoDeployProjectName?: string;
  url?: string;
}

const REPLACEMENTS = [
  { find: "P. Hughes", replace: (info: ProjectInfo) => info.authorName },
  { find: "github@phugh.es", replace: (info: ProjectInfo) => info.authorEmail },
  { find: "phughesmcr", replace: (info: ProjectInfo) => info.githubUsername },
  { find: "deno-mcp-template", replace: (info: ProjectInfo) => info.projectName },
  { find: "A demo package for MCP servers in Deno", replace: (info: ProjectInfo) => info.projectDescription },
  { find: "@phughesmcr/deno-mcp-template", replace: (info: ProjectInfo) => `@${info.jsrScope || info.githubUsername}/${info.projectName}` },
  { find: "https://www.phugh.es", replace: (info: ProjectInfo) => info.url || "" },
];

const FILES_TO_UPDATE = [
  ".github/workflows/deploy.yml",
  ".github/CODEOWNERS",
  ".github/FUNDING.yml",
  "src/constants.ts",
  "static/.well-known/llms.txt",
  "static/.well-known/openapi.yaml",
  "AUTHORS.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "deno.json",
  "LICENSE",
  "SECURITY.md",
  "SUPPORT.md",
];

function promptUser(question: string, defaultValue?: string): string {
  const promptText = defaultValue ? `${question} (${defaultValue})` : question;
  const answer = prompt(promptText + ":");
  return answer?.trim() || defaultValue || "";
}

function collectProjectInfo(): ProjectInfo {
  console.log("🚀 Setting up your MCP server template...\n");
  
  const authorName = promptUser("Your full name", "Your Name");
  const authorEmail = promptUser("Your email address", "you@example.com");
  const githubUsername = promptUser("Your GitHub username");
  const projectName = promptUser("Project name (kebab-case)", "my-mcp-server");
  const projectDescription = promptUser("Project description", "My custom MCP server");
  const jsrScope = promptUser("JSR scope (optional, will use GitHub username if empty)");
  const url = promptUser("Project URL (optional)", "");
  
  return {
    authorName,
    authorEmail,
    githubUsername,
    projectName,
    projectDescription,
    jsrScope,
    url,
  };
}

async function updateFile(filePath: string, info: ProjectInfo): Promise<void> {
  try {
    let content = await Deno.readTextFile(filePath);
    let updated = false;
    
    for (const { find, replace } of REPLACEMENTS) {
      const newValue = replace(info);
      if (content.includes(find)) {
        content = content.replaceAll(find, newValue);
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

async function main(): Promise<void> {
  try {
    const info = collectProjectInfo();
    
    console.log("\n📋 Project Information:");
    console.log(`   Name: ${info.projectName}`);
    console.log(`   Author: ${info.authorName} <${info.authorEmail}>`);
    console.log(`   Description: ${info.projectDescription}`);
    console.log(`   GitHub: ${info.githubUsername}`);
    console.log(`   JSR: @${info.jsrScope || info.githubUsername}/${info.projectName}`);
    console.log(`   URL: ${info.url}`);

    const confirm = promptUser("\nProceed with setup? (y/N)", "N");
    if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
      console.log("Setup cancelled.");
      return;
    }
    
    await updateAllFiles(info);
    
    console.log("\n🎉 Template setup complete!");
    console.log("\nNext steps:");
    console.log("1. Review the updated files and the rest of the repo.");
    console.log("2. Update the files in static/.well-known to reflect your server.");
    console.log("3. Update any GitHub repo & Deno Deploy settings and secrets");
    console.log("4. Run `deno task prep` to format and check the code");
    console.log("5. Start coding your MCP server!");
  } catch (error) {
    console.error("❌ Setup failed:", error);
    Deno.exit(1);
  }
}

async function cleanup(): Promise<void> {
  // remove setup task from deno.json
  const denoJson = await Deno.readTextFile("deno.json");
  const denoJsonUpdated = denoJson.replace("\"setup\": \"deno run -A scripts/setup-template.ts\",", "");
  await Deno.writeTextFile("deno.json", denoJsonUpdated);
  
  // delete this script and scripts folder
  await Deno.remove("scripts", { recursive: true });
}

if (import.meta.main) {
  await main();
  await cleanup();
} 