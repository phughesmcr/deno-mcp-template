import { dirname, join } from "@std/path";

import {
  applyReplacements,
  buildReplacements,
  collectProjectInfo,
  FILES_TO_UPDATE,
  parseSetupCli,
  planUpdates,
  type ProjectInfo,
  removeSetupFiles,
  validateProjectInfo,
  writeUpdates,
} from "../scripts/setup-template.ts";
import { assert, assertEquals } from "./helpers.ts";

const INFO: ProjectInfo = {
  authorName: "Ann Other",
  authorEmail: "ann@example.com",
  githubUsername: "AnnOther",
  projectName: "my-server",
  projectDisplayName: "My Server",
  projectDescription: "Costs $& nothing, and isn't a `template`.",
  url: "https://example.com/app",
};

const IDENTIFIERS = /phughesmcr|deno-mcp-template|Deno MCP (Server )?Template|P\. Hughes|phugh\.es/;

function failure(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return String(error);
  }
  throw new Error("expected a failure");
}

async function rejection(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    return String(error);
  }
  throw new Error("expected a failure");
}

async function copyOfTemplate(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "setup-template-test-" });
  for (const path of FILES_TO_UPDATE) {
    await Deno.mkdir(dirname(join(root, path)), { recursive: true });
    await Deno.copyFile(path, join(root, path)).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    });
  }
  return root;
}

Deno.test("replacement text is literal, so $& stays as typed", () => {
  const replaced = applyReplacements(`A template for building MCP servers with Deno.`, [
    ...buildReplacements(INFO, "0.8.0"),
  ]);
  assertEquals(replaced, INFO.projectDescription);
});

Deno.test("validation accepts ordinary values", () => {
  validateProjectInfo(INFO);
});

Deno.test("validation rejects text that would break JSON, TS or YAML", () => {
  const bad: Array<[Partial<ProjectInfo>, string]> = [
    [{ projectDescription: `Says "hello"` }, "Description"],
    [{ projectDescription: "back\\slash" }, "Description"],
    [{ projectDescription: "two\nlines" }, "Description"],
    [{ authorName: `Ann "AO" Other` }, "Author name"],
    [{ projectDisplayName: "Pay $& now" }, "Display name"],
    [{ projectDisplayName: "Server: the sequel" }, "Display name"],
    [{ projectName: "Not Kebab" }, "kebab-case"],
    [{ githubUsername: "" }, "GitHub username"],
    [{ authorEmail: "nobody" }, "Email"],
    [{ jsrScope: "AnnOther" }, "JSR scope"],
    [{ url: `https://example.com/"` }, "URL"],
    [{ url: "ftp://example.com" }, "URL"],
  ];
  for (const [change, expected] of bad) {
    const message = failure(() => validateProjectInfo({ ...INFO, ...change }));
    assert(message.includes(expected), message);
  }
});

Deno.test("a mistyped or removed flag is an error", () => {
  assert(failure(() => parseSetupCli(["--non-interactiv"])).includes("--non-interactiv"));
  assert(failure(() => parseSetupCli(["--deno-deploy-app=x"])).includes("--deno-deploy-app"));
});

Deno.test("non-interactive setup names what is missing", () => {
  const cli = parseSetupCli(["--non-interactive", "--author-name=Ann"]);
  assert(failure(() => collectProjectInfo(cli)).includes("--author-email"));
});

Deno.test("flags become the prompt defaults in interactive setup", () => {
  const cli = parseSetupCli(["--project-name=flagged-name", "--github-username=flagged-user"]);
  const defaults: Record<string, string | undefined> = {};
  const info = collectProjectInfo({ ...cli, nonInteractive: false }, (question, defaultValue) => {
    defaults[question] = defaultValue;
    return defaultValue ?? "";
  });
  assertEquals(defaults["Project name (kebab-case)"], "flagged-name");
  assertEquals(info.projectName, "flagged-name");
  assertEquals(info.githubUsername, "flagged-user");
  assertEquals(info.authorName, "Your Name");
  assertEquals(info.url, undefined);
});

Deno.test("the plan leaves no template identifier and writes nothing", async () => {
  const before = await Deno.readTextFile("deno.json");
  const plan = await planUpdates(INFO);
  assertEquals(await Deno.readTextFile("deno.json"), before);
  for (const [path, content] of plan) {
    const found = content.match(IDENTIFIERS)?.[0];
    assert(found === undefined, `${path} still has ${found}`);
  }
});

Deno.test("the plan applies the project's URL, version and JSR scope", async () => {
  const plan = await planUpdates(INFO);
  const config = JSON.parse(plan.get("deno.json") ?? "{}");
  assertEquals(config.homepage, "https://example.com/app");
  assertEquals(config.version, "0.1.0");
  assertEquals(config.name, "@annother/my-server");
  assertEquals(config.bugs.url, "https://github.com/AnnOther/my-server/issues");
  assertEquals(JSON.parse(plan.get("static/mcpb-manifest.json") ?? "{}").version, "0.1.0");
  assert(plan.get("static/.well-known/openapi.yaml")?.includes("\n  version: 0.1.0\n"), "openapi");
  assert(plan.get("README.md")?.startsWith("# My Server\n"), "README title");
  assert(!plan.get("CHANGELOG.md")?.includes("0.8.0"), "changelog");
});

Deno.test("the plan fails on a missing file, except one strip removes", async () => {
  const root = await copyOfTemplate();
  try {
    await Deno.remove(join(root, "src/mcp/apps/fetchWebsiteInfoApp.ts")).catch(() => {});
    await planUpdates(INFO, root);
    await Deno.remove(join(root, "README.md"));
    assert((await rejection(planUpdates(INFO, root))).includes("README.md"));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("the plan fails before writing if a JSON file would not parse", async () => {
  const root = await copyOfTemplate();
  try {
    const path = join(root, "static/mcpb-manifest.json");
    await Deno.writeTextFile(path, `{"description": "Deno MCP Template",}`);
    const message = await rejection(planUpdates(INFO, root));
    assert(message.includes("JSON"), message);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a failed write is reported and the other files still update", async () => {
  const root = await Deno.makeTempDir({ prefix: "setup-template-test-" });
  const log = console.log;
  const error = console.error;
  console.log = console.error = () => {};
  try {
    await Deno.writeTextFile(join(root, "locked.txt"), "before");
    await Deno.chmod(join(root, "locked.txt"), 0o444);
    const failed = await writeUpdates(
      new Map([["locked.txt", "after"], ["open.txt", "after"]]),
      root,
    );
    assertEquals(failed.join(), "locked.txt");
    assertEquals(await Deno.readTextFile(join(root, "open.txt")), "after");
  } finally {
    console.log = log;
    console.error = error;
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("cleanup drops the task and files, keeping deno.json on two spaces", async () => {
  const root = await Deno.makeTempDir({ prefix: "setup-template-test-" });
  try {
    await Deno.mkdir(join(root, "scripts"));
    await Deno.writeTextFile(join(root, "scripts/setup-template.ts"), "");
    await Deno.writeTextFile(
      join(root, "deno.json"),
      JSON.stringify({ tasks: { setup: "x", start: "y" } }),
    );
    await removeSetupFiles(root);
    assertEquals(
      await Deno.readTextFile(join(root, "deno.json")),
      `{\n  "tasks": {\n    "start": "y"\n  }\n}\n`,
    );
    assertEquals(await Deno.stat(join(root, "scripts/setup-template.ts")).catch(() => null), null);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
