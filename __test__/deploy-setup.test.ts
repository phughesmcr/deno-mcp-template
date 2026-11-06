import { buildSetupSteps, randomSecret, runSetupSteps } from "../scripts/deploy-setup.ts";
import { assert, assertEquals } from "./helpers.ts";

const steps = buildSetupSteps({
  org: "acme",
  app: "demo",
  region: "eu",
  hosts: ["mcp.example.com"],
  bearerToken: "token-value",
  stateKey: "state-value",
});

function indexOfStep(...parts: string[]): number {
  return steps.findIndex((step) => parts.every((part) => step.args.includes(part)));
}

function stepWith(...parts: string[]) {
  const step = steps[indexOfStep(...parts)];
  assert(step !== undefined, `no step with ${parts.join(" ")}`);
  return step;
}

Deno.test("setup attaches KV after create and before the production deploy", () => {
  const create = indexOfStep("create");
  const assign = indexOfStep("assign");
  const deploy = indexOfStep("--prod");
  assertEquals(create, 0);
  assert(indexOfStep("provision") < assign, "provision before assign");
  assertEquals(deploy, steps.length - 1);
  assert(
    stepWith("create").args.includes("--no-wait"),
    "create must not wait on a revision that fails",
  );
});

Deno.test("setup allows previews and custom domains", () => {
  const hosts = stepWith("MCP_ALLOWED_HOSTS");
  assert(hosts.args.includes("*.acme.deno.net,mcp.example.com"), hosts.args.join(" "));
});

Deno.test("setup never shows secrets in its display form", () => {
  const shown = steps.flatMap((step) => step.display ?? step.args).join(" ");
  assert(!shown.includes("token-value"), "bearer token leaked");
  assert(!shown.includes("state-value"), "state key leaked");
  assert(stepWith("MCP_REQUEST_STATE_KEY").args.includes("--secret"), "must be secret");
});

Deno.test("setup stops at the first failed step", async () => {
  const ran: string[][] = [];
  let message = "";
  try {
    await runSetupSteps(steps, (args) => {
      ran.push(args);
      return Promise.resolve(ran.length < 2);
    });
  } catch (error) {
    message = String(error);
  }
  assertEquals(ran.length, 2);
  assert(message.includes("Provision"), message);
});

Deno.test("randomSecret is long enough for MCP_REQUEST_STATE_KEY", () => {
  assertEquals(randomSecret().length, 64);
});
