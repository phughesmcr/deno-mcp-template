#!/usr/bin/env -S deno run -A

/**
 * @description One-off setup for a new Deno Deploy app: KV, Host allowlist, secrets, production deploy
 * @usage       deno task deploy:setup --org <org> --app <app> [--host <domain>] [--region us] [--yes] [--dry-run]
 * @license     MIT
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";

import { checkDeployment } from "./smoke-deploy.ts";

/** Every client shares one limit on Deploy, where the server sees no client IP. */
const SHARED_RATE_LIMIT = "1000";
const REDACTED = "<secret>";

export interface SetupOptions {
  org: string;
  app: string;
  region: string;
  hosts: string[];
  bearerToken: string;
  stateKey: string;
}

export interface SetupStep {
  title: string;
  args: string[];
  /** Printed instead of `args`, so a log never shows a secret. */
  display?: string[];
}

export function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Order matters: `create` deploys at once, and a database can only attach to an existing app. */
export function buildSetupSteps(options: SetupOptions): SetupStep[] {
  const { org, app, region, hosts, bearerToken, stateKey } = options;
  const scope = ["--non-interactive", "--org", org];
  const appScope = [...scope, "--app", app];
  const database = `${app}-kv`;
  const env = (name: string, value: string): SetupStep => ({
    title: `Set ${name}`,
    args: ["deploy", "env", "add", name, value, ...appScope],
  });
  const secret = (name: string, value: string): SetupStep => {
    const command = (shown: string) => [
      "deploy",
      "env",
      "add",
      "--secret",
      name,
      shown,
      ...appScope,
    ];
    return { title: `Set ${name}`, args: command(value), display: command(REDACTED) };
  };
  return [
    {
      title: "Create the app (its first revision fails until KV is attached)",
      args: [
        "deploy",
        "create",
        ...appScope,
        "--no-wait",
        "--source",
        "local",
        "--runtime-mode",
        "dynamic",
        "--entrypoint",
        "main.ts",
        "--build-timeout",
        "5",
        "--build-memory-limit",
        "1024",
        "--region",
        region,
      ],
    },
    {
      title: "Provision a KV database",
      args: ["deploy", "database", "provision", database, "--kind", "denokv", ...scope],
    },
    {
      title: "Attach the KV database",
      args: ["deploy", "database", "assign", database, ...appScope],
    },
    env("MCP_DNS_REBINDING", "true"),
    env("MCP_ALLOWED_HOSTS", [`*.${org}.deno.net`, ...hosts].join(",")),
    env("MCP_HTTP_RATE_LIMIT_UNKNOWN_MAX", SHARED_RATE_LIMIT),
    secret("MCP_HTTP_BEARER_TOKEN", bearerToken),
    secret("MCP_REQUEST_STATE_KEY", stateKey),
    { title: "Deploy to production", args: ["deploy", ...appScope, "--prod"] },
  ];
}

async function runDeno(args: string[]): Promise<boolean> {
  const { success } = await new Deno.Command(Deno.execPath(), {
    args,
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  return success;
}

/** Stops at the first failure, and throws an error naming the step. */
export async function runSetupSteps(
  steps: SetupStep[],
  run: (args: string[]) => Promise<boolean> = runDeno,
): Promise<void> {
  for (const step of steps) {
    console.log(`\n==> ${step.title}`);
    if (!await run(step.args)) {
      throw new Error(`Failed at: ${step.title}. The earlier steps have already run.`);
    }
  }
}

async function main(): Promise<void> {
  const flags = parseArgs(Deno.args, {
    string: ["org", "app", "region", "host"],
    boolean: ["yes", "dry-run"],
    collect: ["host"],
    default: { region: "us" },
  });
  const org = flags.org ?? Deno.env.get("DENO_DEPLOY_ORG");
  const app = flags.app ?? Deno.env.get("DENO_DEPLOY_APP");
  if (!org || !app) {
    throw new Error("usage: deno task deploy:setup --org <org> --app <app>");
  }

  const suppliedToken = Deno.env.get("MCP_HTTP_BEARER_TOKEN");
  if (!suppliedToken && Deno.env.get("CI")) {
    throw new Error("In CI, set MCP_HTTP_BEARER_TOKEN: a generated token would land in the log.");
  }
  const bearerToken = suppliedToken || randomSecret();
  const stateKey = Deno.env.get("MCP_REQUEST_STATE_KEY") || randomSecret();
  const steps = buildSetupSteps({
    org,
    app,
    region: flags.region,
    hosts: flags.host as string[],
    bearerToken,
    stateKey,
  });

  if (flags["dry-run"]) {
    for (const step of steps) console.log(`deno ${(step.display ?? step.args).join(" ")}`);
    return;
  }

  const question = `This creates ${app} in ${org} and deploys it to production, twice: ` +
    "`deno deploy create` deploys straight away. Continue?";
  if (!flags.yes && !confirm(question)) return;

  await runSetupSteps(steps);

  const url = `https://${app}.${org}.deno.net`;
  console.log(`\nOK ${url}: ${await checkDeployment(url, bearerToken)}`);
  if (!suppliedToken) {
    console.log(`\nBearer token, shown once. Clients send it on /mcp:\n${bearerToken}`);
  }
}

if (import.meta.main) await main();
