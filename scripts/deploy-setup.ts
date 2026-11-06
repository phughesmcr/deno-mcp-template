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
/** Stands for the temp file in {@link SetupStep.args}. */
const ENV_FILE = "<env-file>";
/** `deno deploy` exit codes. */
const EXIT_NOT_FOUND = 4;
const EXIT_CONFLICT = 5;

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
  /** Skipped when the app already exists. */
  createsApp?: boolean;
  /** A conflict means an earlier run did this step. */
  conflictMeansDone?: boolean;
  /** Written to a temp file for this step only, so no value reaches `args`, and so `ps` or a log. */
  env?: Record<string, string>;
}

export type RunDeno = (args: string[]) => Promise<number>;

export function randomSecret(): string {
  return crypto.getRandomValues(new Uint8Array(32)).toHex();
}

/** The address users reach: their own domain if they have one, else the default. */
export function publicUrl(
  { org, app, hosts }: Pick<SetupOptions, "org" | "app" | "hosts">,
): string {
  return hosts[0] ? `https://${hosts[0]}` : `https://${app}.${org}.deno.net`;
}

/** Order matters: `create` deploys at once, and a database can only attach to an existing app. */
export function buildSetupSteps(options: SetupOptions): SetupStep[] {
  const { org, app, region, hosts, bearerToken, stateKey } = options;
  const scope = ["--non-interactive", "--org", org];
  const appScope = [...scope, "--app", app];
  const database = `${app}-kv`;
  return [
    {
      title: "Create the app (its first revision fails until KV is attached)",
      createsApp: true,
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
      conflictMeansDone: true,
      args: ["deploy", "database", "provision", database, "--kind", "denokv", ...scope],
    },
    {
      title: "Attach the KV database",
      conflictMeansDone: true,
      args: ["deploy", "database", "assign", database, ...appScope],
    },
    {
      title: "Set env vars and secrets",
      // `env load` stores a name as a secret when it ends in KEY or TOKEN, as the last two do.
      args: ["deploy", "env", "load", ENV_FILE, "--replace", ...appScope],
      env: {
        MCP_DNS_REBINDING: "true",
        MCP_ALLOWED_HOSTS: [`*.${org}.deno.net`, ...hosts].join(","),
        MCP_HTTP_RATE_LIMIT_UNKNOWN_MAX: SHARED_RATE_LIMIT,
        MCP_PUBLIC_BASE_URL: publicUrl(options),
        MCP_HTTP_BEARER_TOKEN: bearerToken,
        MCP_REQUEST_STATE_KEY: stateKey,
      },
    },
    { title: "Deploy to production", args: ["deploy", ...appScope, "--prod"] },
  ];
}

/** Single quotes, as dotenv would expand `$` inside double quotes. */
export function formatEnvFile(env: Record<string, string>): string {
  return Object.entries(env).map(([name, value]) => {
    if (/['\r\n]/.test(value)) throw new Error(`${name} must not contain ' or a line break.`);
    return `${name}='${value}'\n`;
  }).join("");
}

/** Deno creates temp files with mode 0600. */
async function withEnvFile<T>(
  env: Record<string, string>,
  use: (path: string) => Promise<T>,
): Promise<T> {
  const path = await Deno.makeTempFile({ prefix: "deploy-setup-", suffix: ".env" });
  try {
    await Deno.writeTextFile(path, formatEnvFile(env));
    return await use(path);
  } finally {
    await Deno.remove(path);
  }
}

async function runDeno(args: string[]): Promise<number> {
  const { code } = await new Deno.Command(Deno.execPath(), {
    args,
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  return code;
}

/** @returns Whether the app exists. Anything but "yes" or "not found" is an error. */
export async function appExists(org: string, app: string, run: RunDeno): Promise<boolean> {
  const code = await run(
    ["deploy", "apps", "get", "--json", "--non-interactive", "--org", org, "--app", app],
  );
  if (code === 0) return true;
  if (code === EXIT_NOT_FOUND) return false;
  throw new Error(`Could not check whether ${app} exists: \`deno deploy\` exited with ${code}.`);
}

/** Stops at the first failure, and throws an error naming the step and what is left. */
export async function runSetupSteps(
  steps: SetupStep[],
  run: RunDeno = runDeno,
  onDone: (step: SetupStep) => void = () => {},
): Promise<void> {
  for (const [index, step] of steps.entries()) {
    console.log(`\n==> ${step.title}`);
    const code = step.env ?
      await withEnvFile(
        step.env,
        (path) => run(step.args.map((arg) => arg === ENV_FILE ? path : arg)),
      ) :
      await run(step.args);
    if (code !== 0 && !(step.conflictMeansDone && code === EXIT_CONFLICT)) {
      const left = steps.slice(index).map(({ args }) => `  deno ${args.join(" ")}`).join("\n");
      throw new Error(
        `Failed at: ${step.title}. The earlier steps have already run.\n` +
          `Run deploy:setup again once it's fixed, or run what's left yourself:\n${left}`,
      );
    }
    onDone(step);
  }
}

export interface SetupDeps {
  run: RunDeno;
  /** Like {@link run}, without the output: `apps get` prints the whole app as JSON. */
  probe: RunDeno;
  check: typeof checkDeployment;
  ask: (question: string) => boolean;
  isTerminal: () => boolean;
}

const DEFAULT_DEPS: SetupDeps = {
  run: runDeno,
  probe: async (args) => {
    const command = new Deno.Command(Deno.execPath(), {
      args,
      stdin: "null",
      stdout: "null",
      stderr: "inherit",
    });
    return (await command.output()).code;
  },
  check: checkDeployment,
  ask: confirm,
  isTerminal: () => Deno.stdin.isTerminal(),
};

export async function deploySetup(args: string[], deps: Partial<SetupDeps> = {}): Promise<void> {
  const { run, probe, check, ask, isTerminal } = { ...DEFAULT_DEPS, ...deps };
  const flags = parseArgs(args, {
    string: ["org", "app", "region", "host"],
    boolean: ["yes", "dry-run"],
    collect: ["host"],
    default: { region: "us" },
    unknown: (arg) => {
      throw new Error(`Unknown option: ${arg}`);
    },
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
    for (const step of steps) {
      console.log(`deno ${step.args.join(" ")}`);
      if (step.env) console.log(`  ${ENV_FILE}: ${Object.keys(step.env).join(", ")}`);
    }
    return;
  }

  if (!flags.yes && !isTerminal()) {
    throw new Error("Nobody can answer the prompt here: pass --yes to go ahead.");
  }

  const exists = await appExists(org, app, probe);
  const question = exists ?
    `${app} already exists in ${org}. This keeps the app, replaces its env vars, including the ` +
    "bearer token and state key, and deploys it to production. Continue?" :
    `This creates ${app} in ${org} and deploys it to production, twice: ` +
    "`deno deploy create` deploys straight away. Continue?";
  if (!flags.yes && !ask(question)) return;

  // Printed as soon as it's stored, as it can't be read back if a later step fails.
  const showToken = (step: SetupStep) => {
    if (step.env && !suppliedToken) {
      console.log(`\nBearer token, shown once. Clients send it on /mcp:\n${bearerToken}`);
    }
  };
  await runSetupSteps(steps.filter((step) => !(exists && step.createsApp)), run, showToken);

  const url = `https://${app}.${org}.deno.net`;
  console.log(`\nOK ${url}: ${await check(url, bearerToken)}`);
}

if (import.meta.main) await deploySetup(Deno.args);
