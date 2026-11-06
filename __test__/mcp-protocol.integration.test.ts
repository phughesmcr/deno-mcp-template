/**
 * Drives the real server with the SDK client over HTTP and stdio, as separate processes. Needs
 * `--allow-run`, so `deno task test:integration` runs it in its second pass.
 */
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { deadline } from "@std/async/deadline";
import { delay } from "@std/async/delay";

import { assert, assertEquals } from "./helpers.ts";
import {
  createClient,
  createLegacyClient,
  firstText,
  freePort,
  overHttp,
  overStdio,
  SERVER_ARGS,
  waitForHttp,
  withKvPath,
} from "./mcpProtocol.ts";

/** Stops `server` if it has not exited, so a failed test leaves nothing running. */
async function stopIfRunning(server: Deno.ChildProcess): Promise<void> {
  try {
    server.kill();
  } catch {
    // Already exited.
  }
  await server.status;
}

/** The behaviour both transports must share. */
async function exerciseClient(client: Client): Promise<void> {
  assertEquals(client.getProtocolEra(), "modern");

  const { tools } = await client.listTools();
  assert(tools.some((tool) => tool.name === "echo"), "tools/list misses a tool");

  const result = await client.callTool({ name: "echo", arguments: { message: "hello" } });
  assertEquals(firstText(result), "hello");

  const subscription = await client.listen({ toolsListChanged: true });
  await subscription.close();
}

Deno.test("SDK client round trip over HTTP", () => overHttp(createClient(), exerciseClient));

Deno.test("SDK client round trip over stdio", () => overStdio(createClient(), exerciseClient));

Deno.test("a 2025-era client is refused over stdio", async () => {
  await withKvPath(async (kvPath) => {
    const client = new Client({ name: "legacy", version: "1.0.0" });
    const connecting = client.connect(
      new StdioClientTransport({
        command: Deno.execPath(),
        args: [...SERVER_ARGS, "--no-http"],
        env: { ...Deno.env.toObject(), MCP_KV_PATH: kvPath },
        stderr: "ignore",
      }),
    );
    const refused = await connecting.then(() => false, () => true);
    await client.close();
    assert(refused, "stdio accepted a 2025-era initialize");
  });
});

Deno.test("--legacy-stdio serves a 2025-era client over stdio", () =>
  overStdio(createLegacyClient(), async (client) => {
    assertEquals(client.getProtocolEra(), "legacy");

    const { tools } = await client.listTools();
    assert(tools.some((tool) => tool.name === "echo"), "tools/list misses a tool");

    const result = await client.callTool({ name: "echo", arguments: { message: "hello" } });
    assertEquals(firstText(result), "hello");
  }, ["--legacy-stdio"]));

Deno.test("--legacy-stdio still serves a 2026-07-28 client over stdio", () =>
  overStdio(createClient(), exerciseClient, ["--legacy-stdio"]));

Deno.test("--legacy-stdio leaves HTTP refusing 2025-era clients", async () => {
  await withKvPath(async (kvPath) => {
    const port = freePort();
    const server = new Deno.Command(Deno.execPath(), {
      args: [...SERVER_ARGS, "--legacy-stdio", "--no-http-rate-limit"],
      env: { MCP_PORT: String(port), MCP_HOSTNAME: "127.0.0.1", MCP_KV_PATH: kvPath },
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).spawn();
    const url = `http://127.0.0.1:${port}/mcp`;

    try {
      await waitForHttp(url);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "legacy", version: "1.0.0" },
          },
        }),
      });
      const body = await response.json();
      assertEquals(response.status, 400);
      assertEquals(body.error.code, -32022);
    } finally {
      await stopIfRunning(server);
    }
  });
});

Deno.test("the server exits by itself when stdin closes and HTTP is off", async () => {
  await withKvPath(async (kvPath) => {
    const server = new Deno.Command(Deno.execPath(), {
      args: [...SERVER_ARGS, "--no-http"],
      env: { MCP_KV_PATH: kvPath },
      stdin: "piped",
      stdout: "null",
      stderr: "null",
    }).spawn();

    try {
      await server.stdin.close();
      const { code } = await deadline(server.status, 10_000);
      assertEquals(code, 0);
    } finally {
      await stopIfRunning(server);
    }
  });
});

Deno.test("the server keeps serving HTTP when stdin closes", async () => {
  await withKvPath(async (kvPath) => {
    const port = freePort();
    const server = new Deno.Command(Deno.execPath(), {
      args: [...SERVER_ARGS, "--no-http-rate-limit"],
      env: { MCP_PORT: String(port), MCP_HOSTNAME: "127.0.0.1", MCP_KV_PATH: kvPath },
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).spawn();
    const url = `http://127.0.0.1:${port}/mcp`;

    try {
      await waitForHttp(url);
      await delay(500);
      await waitForHttp(url);
    } finally {
      await stopIfRunning(server);
    }
  });
});

/** Runs `body` with `onShutdown` installed, in a process of its own: it may exit. */
async function runWithSignalHandlers(onShutdown: string, body = ""): Promise<Deno.CommandOutput> {
  return await new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      `import { setupSignalHandlers } from "$/app/signals.ts";
       setupSignalHandlers(${onShutdown});
       ${body}`,
    ],
    stdout: "null",
    stderr: "piped",
  }).output();
}

Deno.test("an unhandled rejection is logged and shutdown finishes before exit", async () => {
  const { code, stderr } = await runWithSignalHandlers(
    `async () => {
       await new Promise((resolve) => setTimeout(resolve, 50));
       console.error("shutdown finished");
     }`,
    `Promise.reject(new Error("boom"));`,
  );

  const log = new TextDecoder().decode(stderr);
  assertEquals(code, 1);
  assert(log.includes("boom"), log);
  assert(log.includes("shutdown finished"), log);
});

Deno.test("a failed shutdown is logged, not raised as a new rejection", async () => {
  const onShutdown = `() => Promise.reject(new Error("stop failed"))`;
  const afterRejection = await runWithSignalHandlers(
    onShutdown,
    `Promise.reject(new Error("boom"));`,
  );
  const atUnload = await runWithSignalHandlers(onShutdown);

  assertEquals(afterRejection.code, 1);
  assertEquals(atUnload.code, 0);
  for (const { stderr } of [afterRejection, atUnload]) {
    const log = new TextDecoder().decode(stderr);
    assert(log.includes("shutdown failed"), log);
    assert(!log.includes("Uncaught"), log);
  }
});
