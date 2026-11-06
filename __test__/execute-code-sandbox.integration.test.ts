/**
 * The real sandbox test requires `DENO_DEPLOY_TOKEN` (and Deploy sandbox quota) and is skipped in
 * CI when unset. The stop-and-kill paths use a fake sandbox, so they always run.
 */
import { Sandbox } from "@deno/sandbox";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";

import sandboxTool from "$/mcp/tools/sandbox.ts";
import { assert, assertEquals, mcpFactoryContext } from "./helpers.ts";

const hasDeployToken = Boolean(Deno.env.get("DENO_DEPLOY_TOKEN")?.trim());

type ToolCallback = (args: unknown, ctx: ServerContext) => Promise<CallToolResult>;

function sandboxHandler(): ToolCallback {
  let handler: ToolCallback | undefined;
  const fakeMcp = {
    registerTool: (_name: string, _config: unknown, cb: ToolCallback) => {
      handler = cb;
    },
  } as unknown as McpServer;
  sandboxTool.register(fakeMcp, mcpFactoryContext());
  assert(handler, "expected sandbox tool to register a handler");
  return handler;
}

function contextWith(signal: AbortSignal): ServerContext {
  return { mcpReq: { signal, _meta: {} } } as unknown as ServerContext;
}

type FakeRun = {
  /** Signals passed to `child.kill`, in order. */
  kills: string[];
  /** How many sandboxes were created. */
  created: number;
};

const exited = (code: number, stdoutText = "") => ({
  status: { code, success: code === 0, signal: null },
  stdoutText,
  stderrText: "",
});

/**
 * Runs `fn` with `Sandbox.create` faked. The child exits only when killed, unless `output` says how
 * it ends; `onSpawn` runs once it has started.
 */
async function withFakeSandbox(
  fn: (run: FakeRun) => Promise<void>,
  options: { output?: ReturnType<typeof exited>; onSpawn?: () => void } = {},
): Promise<void> {
  const run: FakeRun = { kills: [], created: 0 };
  const exit = Promise.withResolvers<ReturnType<typeof exited>>();
  if (options.output) exit.resolve(options.output);
  const child = {
    kill(signal: string) {
      run.kills.push(signal);
      exit.resolve(exited(137));
      return Promise.resolve();
    },
    output: () => exit.promise,
  };
  const sandbox = {
    fs: { writeTextFile: () => Promise.resolve() },
    spawn() {
      options.onSpawn?.();
      return Promise.resolve(child);
    },
    [Symbol.asyncDispose]: () => Promise.resolve(),
  };

  const realCreate = Sandbox.create;
  Sandbox.create = () => {
    run.created++;
    return Promise.resolve(sandbox as unknown as Sandbox);
  };
  try {
    await fn(run);
  } finally {
    Sandbox.create = realCreate;
  }
}

const ARGS = { code: "1", language: "javascript", timeoutMs: 100 };

function errorText(result: CallToolResult): string {
  assertEquals(result.isError, true);
  return JSON.stringify(result.content);
}

Deno.test("execute-code kills code that overruns its timeout", async () => {
  await withFakeSandbox(async (run) => {
    const result = await sandboxHandler()(ARGS, contextWith(new AbortController().signal));
    assert(errorText(result).includes("timed out after 100ms"), "expected a timeout error");
    assertEquals(run.kills.join(), "SIGKILL");
  });
});

Deno.test("execute-code kills running code when the request is cancelled", async () => {
  const controller = new AbortController();
  const stop = () => setTimeout(() => controller.abort(), 1);
  await withFakeSandbox(async (run) => {
    const args = { ...ARGS, timeoutMs: 30_000 };
    const result = await sandboxHandler()(args, contextWith(controller.signal));
    assert(errorText(result).includes("cancelled"), "expected a cancelled error");
    assertEquals(run.kills.join(), "SIGKILL");
  }, { onSpawn: stop });
});

Deno.test("execute-code does not start a sandbox for a cancelled request", async () => {
  await withFakeSandbox(async (run) => {
    const result = await sandboxHandler()(ARGS, contextWith(AbortSignal.abort()));
    assert(errorText(result).includes("cancelled"), "expected a cancelled error");
    assertEquals(run.created, 0);
  });
});

Deno.test("execute-code returns the output of code that finishes in time", async () => {
  await withFakeSandbox(async (run) => {
    const args = { ...ARGS, timeoutMs: 30_000 };
    const result = await sandboxHandler()(args, contextWith(new AbortController().signal));
    assertEquals(result.isError, undefined);
    assert(JSON.stringify(result.content).includes("done"), "expected stdout");
    assertEquals(run.kills.length, 0);
  }, { output: exited(0, "done") });
});

Deno.test({
  name: "execute-code tool runs trivial script in Deno Sandbox",
  ignore: !hasDeployToken,
  fn: async () => {
    const handler = sandboxHandler();
    const ctx = contextWith(AbortSignal.timeout(120_000));

    const result = await handler(
      {
        code: 'console.log("sandbox_ci_ok")',
        language: "javascript" as const,
        timeoutMs: 30_000,
      },
      ctx,
    );

    const payload = JSON.stringify(result);
    assert(
      payload.includes("sandbox_ci_ok"),
      `expected stdout in tool result, got: ${payload.slice(0, 500)}`,
    );
  },
});
