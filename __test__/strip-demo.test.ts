import { DELETE, parseStripArgs, prepareWrites } from "../scripts/strip-demo.ts";
import { assert, assertEquals } from "./helpers.ts";

Deno.test("a mistyped flag is an error, not a real strip", () => {
  let message = "";
  try {
    parseStripArgs(["--dryrun"]);
  } catch (error) {
    message = String(error);
  }
  assert(message.includes("--dryrun"), message);
  assertEquals(parseStripArgs(["--dry-run"])["dry-run"], true);
});

Deno.test("every path in DELETE exists", async () => {
  // `deno task setup` deletes the workflow, and the two scripts can run in either order.
  for (const path of DELETE.filter((path) => path !== ".github/workflows/setup.yml")) {
    assert(await Deno.stat(path).catch(() => null) !== null, `${path} does not exist`);
  }
});

Deno.test("every patch still matches, with no reference left to what strip deletes", async () => {
  const writes = await prepareWrites();
  const ci = writes[".github/workflows/ci.yml"] ?? "";
  assert(!ci.includes("static/mcp-apps"), "ci.yml keeps the mcp-apps guard");
  assert(!ci.includes("DENO_DEPLOY_TOKEN"), "ci.yml keeps the sandbox token");
  assert(ci.includes("deno task ci"), "ci.yml lost the check");
  assert(!writes["src/shared/validation.ts"]?.includes("safeToolFetchUrl"), "validation.ts");
  assert(writes["src/shared/validation.ts"]?.includes("port.ts"), "validation.ts lost an export");

  const config = JSON.parse(writes["deno.json"] ?? "{}");
  assertEquals(config.tasks["build:mcp-ui"], undefined);
  assertEquals(config.tasks.strip, undefined);
  assertEquals(typeof config.tasks.ci, "string");
});
