import {
  appExists,
  buildSetupSteps,
  deploySetup,
  formatEnvFile,
  publicUrl,
  randomSecret,
  runSetupSteps,
  type SetupDeps,
} from "../scripts/deploy-setup.ts";
import { assert, assertEquals } from "./helpers.ts";

const OPTIONS = {
  org: "acme",
  app: "demo",
  region: "eu",
  hosts: ["mcp.example.com"],
  bearerToken: "token-value",
  stateKey: "state-value",
};

const steps = buildSetupSteps(OPTIONS);

function indexOfStep(...parts: string[]): number {
  return steps.findIndex((step) => parts.every((part) => step.args.includes(part)));
}

function stepWith(...parts: string[]) {
  const step = steps[indexOfStep(...parts)];
  assert(step !== undefined, `no step with ${parts.join(" ")}`);
  return step;
}

const envStep = stepWith("load");

async function failure(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    return String(error);
  }
  throw new Error("expected a failure");
}

/** Runs `use` with console output captured and without the env vars that change the flow. */
async function captured(use: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const log = console.log;
  const saved = ["CI", "MCP_HTTP_BEARER_TOKEN", "MCP_REQUEST_STATE_KEY"].map((name) =>
    [name, Deno.env.get(name)] as const
  );
  for (const [name] of saved) Deno.env.delete(name);
  console.log = (...args: unknown[]) => void lines.push(args.join(" "));
  try {
    await use();
  } finally {
    console.log = log;
    for (const [name, value] of saved) if (value !== undefined) Deno.env.set(name, value);
  }
  return lines.join("\n");
}

/** A `deno deploy` that answers from `codes`, by the subcommand after `deploy`. */
function fakeDeploy(codes: Record<string, number> = {}, exists = false) {
  const ran: string[] = [];
  const deps: Partial<SetupDeps> = {
    run: (args) => {
      const name = args[1] ?? "";
      ran.push(name);
      return Promise.resolve(codes[name] ?? 0);
    },
    probe: () => Promise.resolve(exists ? 0 : 4),
    check: () => Promise.resolve("checked"),
    ask: () => true,
    isTerminal: () => true,
  };
  return { ran, deps };
}

const FLAGS = ["--org", "acme", "--app", "demo"];

Deno.test("setup attaches KV after create and before the production deploy", () => {
  const create = indexOfStep("create");
  const assign = indexOfStep("assign");
  const deploy = indexOfStep("--prod");
  assertEquals(create, 0);
  assert(indexOfStep("provision") < assign, "provision before assign");
  assert(assign < indexOfStep("load"), "assign before env");
  assertEquals(deploy, steps.length - 1);
  assert(
    stepWith("create").args.includes("--no-wait"),
    "create must not wait on a revision that fails",
  );
});

Deno.test("setup allows previews and custom domains", () => {
  assertEquals(envStep.env?.MCP_ALLOWED_HOSTS, "*.acme.deno.net,mcp.example.com");
});

Deno.test("setup points browser links at the public address", () => {
  assertEquals(envStep.env?.MCP_PUBLIC_BASE_URL, "https://mcp.example.com");
  assertEquals(publicUrl({ ...OPTIONS, hosts: [] }), "https://demo.acme.deno.net");
});

Deno.test("setup keeps secrets off the command line", () => {
  const args = steps.flatMap((step) => step.args).join(" ");
  assert(!args.includes("token-value"), "bearer token leaked");
  assert(!args.includes("state-value"), "state key leaked");
  assertEquals(envStep.env?.MCP_HTTP_BEARER_TOKEN, "token-value");
  assertEquals(envStep.env?.MCP_REQUEST_STATE_KEY, "state-value");
});

Deno.test("setup passes env vars in a private temp file, then removes it", async () => {
  let file = "";
  let content = "";
  let mode: number | null = null;
  await captured(() =>
    runSetupSteps([envStep], async (args) => {
      file = args[3] ?? "";
      content = await Deno.readTextFile(file);
      mode = (await Deno.stat(file)).mode;
      return 0;
    })
  );
  assert(content.includes("MCP_HTTP_BEARER_TOKEN='token-value'\n"), "token not in the file");
  assertEquals((mode ?? 0) & 0o777, 0o600);
  assertEquals(await Deno.stat(file).catch(() => null), null);
});

Deno.test("env files quote values, and refuse what quoting can't hold", async () => {
  assertEquals(formatEnvFile({ A: "$b #c" }), `A='$b #c'\n`);
  assert((await failure(Promise.resolve().then(() => formatEnvFile({ A: "it's" })))).includes("A"));
});

Deno.test("setup stops at the first failed step and lists what is left", async () => {
  const ran: string[][] = [];
  let message = "";
  await captured(async () => {
    message = await failure(runSetupSteps(steps, (args) => {
      ran.push(args);
      return Promise.resolve(ran.length < 2 ? 0 : 1);
    }));
  });
  assertEquals(ran.length, 2);
  assert(message.includes("Provision"), message);
  assert(message.includes("deno deploy --non-interactive --org acme --app demo --prod"), message);
  assert(!message.includes("token-value"), "bearer token leaked");
});

Deno.test("a conflict counts as done only where an earlier run explains it", async () => {
  const conflict = (args: string[]) => Promise.resolve(args[1] === "database" ? 5 : 0);
  await captured(() => runSetupSteps(steps, conflict));
  await captured(async () => {
    const message = await failure(runSetupSteps(steps, () => Promise.resolve(5)));
    assert(message.includes("Create the app"), message);
  });
});

Deno.test("appExists tells a missing app from a failed check", async () => {
  assertEquals(await appExists("acme", "demo", () => Promise.resolve(0)), true);
  assertEquals(await appExists("acme", "demo", () => Promise.resolve(4)), false);
  assert((await failure(appExists("acme", "demo", () => Promise.resolve(3)))).includes("3"));
});

Deno.test("a generated token is printed before the deploy, so a failure can't lose it", async () => {
  const { ran, deps } = fakeDeploy({ "--non-interactive": 1 });
  let message = "";
  const output = await captured(async () => {
    message = await failure(deploySetup([...FLAGS, "--yes"], deps));
  });
  assert(message.includes("Deploy to production"), message);
  assertEquals(ran.at(-1), "--non-interactive");
  assert(/Bearer token, shown once[^\n]*\n[0-9a-f]{64}/.test(output), output);
});

Deno.test("a failed smoke check does not lose the token either", async () => {
  const { deps } = fakeDeploy();
  const output = await captured(async () => {
    await failure(deploySetup(FLAGS, { ...deps, check: () => Promise.reject(new Error("down")) }));
  });
  assert(output.includes("Bearer token, shown once"), output);
});

Deno.test("a rerun skips creating an app that exists", async () => {
  const { ran, deps } = fakeDeploy({}, true);
  let question = "";
  await captured(() =>
    deploySetup(FLAGS, {
      ...deps,
      ask: (text) => {
        question = text;
        return true;
      },
    })
  );
  assert(!ran.includes("create"), ran.join());
  assert(question.includes("already exists"), question);
});

Deno.test("nothing runs when the user says no", async () => {
  const { ran, deps } = fakeDeploy();
  await captured(() => deploySetup(FLAGS, { ...deps, ask: () => false }));
  assertEquals(ran.length, 0);
});

Deno.test("without a terminal, --yes is required", async () => {
  const { ran, deps } = fakeDeploy();
  await captured(async () => {
    const message = await failure(deploySetup(FLAGS, { ...deps, isTerminal: () => false }));
    assert(message.includes("--yes"), message);
  });
  assertEquals(ran.length, 0);
});

Deno.test("a mistyped flag runs nothing", async () => {
  const { ran, deps } = fakeDeploy();
  const message = await failure(deploySetup([...FLAGS, "--dryrun", "--yes"], deps));
  assert(message.includes("--dryrun"), message);
  assertEquals(ran.length, 0);
});

Deno.test("dry run runs nothing, and shows env var names without their values", async () => {
  const { ran, deps } = fakeDeploy();
  const output = await captured(() => deploySetup([...FLAGS, "--dry-run"], deps));
  assertEquals(ran.length, 0);
  assert(output.includes("MCP_HTTP_BEARER_TOKEN"), output);
  assert(!/[0-9a-f]{64}/.test(output), "a secret was printed");
});

Deno.test("randomSecret is long enough for MCP_REQUEST_STATE_KEY", () => {
  assertEquals(randomSecret().length, 64);
});
