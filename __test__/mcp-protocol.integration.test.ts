/**
 * Drives the real server with the SDK client over HTTP and stdio, as separate processes. Needs
 * `--allow-run`, so `deno task test:integration` runs it in its second pass.
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { delay } from "@std/async/delay";

import { assert, assertEquals, waitFor } from "./helpers.ts";

const PROTOCOL = "2026-07-28";
const COUNTER_URI = "counter://value";

const SERVER_ARGS = ["run", "-A", "main.ts"];

function createClient(): Client {
  const client = new Client({ name: "protocol-test", version: "1.0.0" }, {
    capabilities: { elicitation: { form: {} } },
    versionNegotiation: { mode: { pin: PROTOCOL } },
  });
  client.setRequestHandler("elicitation/create", (request) => {
    const content: Record<string, string> = request.params.message.includes("name") ?
      { name: "Ada" } :
      { color: "teal" };
    return Promise.resolve({ action: "accept", content });
  });
  return client;
}

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const [block] = result.content ?? [];
  return block?.type === "text" ? block.text : "";
}

/** The behaviour both transports must share. */
async function exerciseClient(client: Client): Promise<void> {
  assertEquals(client.getProtocolEra(), "modern");

  const { tools } = await client.listTools();
  assert(tools.some((tool) => tool.name === "increment-counter"), "tools/list misses a tool");

  const result = await client.callTool({
    name: "test_input_required_result_multi_round",
    arguments: {},
  });
  assertEquals(firstText(result), "Multi-round complete for Ada who likes teal");

  const received: string[] = [];
  client.setNotificationHandler("notifications/tools/list_changed", () => {
    received.push("tools");
  });
  client.setNotificationHandler("notifications/resources/updated", (notification) => {
    received.push(notification.params.uri);
  });
  const subscription = await client.listen({
    toolsListChanged: true,
    resourceSubscriptions: [COUNTER_URI],
  });

  await client.callTool({ name: "notify-list-changed", arguments: { target: "tools" } });
  await waitFor(() => received.includes("tools"), { timeoutMs: 5000 });

  await client.callTool({ name: "increment-counter", arguments: { delta: 1 } });
  await waitFor(() => received.includes(COUNTER_URI), { timeoutMs: 5000 });

  await subscription.close();
}

async function withKvPath(run: (kvPath: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir();
  try {
    await run(`${dir}/test.kv`);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

function freePort(): number {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const { port } = listener.addr;
  listener.close();
  return port;
}

Deno.test("SDK client round trip over HTTP", async () => {
  await withKvPath(async (kvPath) => {
    const port = freePort();
    const server = new Deno.Command(Deno.execPath(), {
      args: [...SERVER_ARGS, "--no-stdio", "--no-http-rate-limit"],
      env: {
        MCP_PORT: String(port),
        MCP_HOSTNAME: "127.0.0.1",
        MCP_KV_PATH: kvPath,
      },
      stdout: "null",
      stderr: "null",
    }).spawn();
    const url = `http://127.0.0.1:${port}/mcp`;

    try {
      for (let attempt = 0; attempt < 200; attempt++) {
        const ready = await fetch(url).then(async (response) => {
          await response.body?.cancel();
          return true;
        }, () => false);
        if (ready) break;
        await delay(50);
      }

      const client = createClient();
      await client.connect(new StreamableHTTPClientTransport(new URL(url)));
      try {
        await exerciseClient(client);
      } finally {
        await client.close();
      }
    } finally {
      server.kill();
      await server.status;
    }
  });
});

Deno.test("SDK client round trip over stdio", async () => {
  await withKvPath(async (kvPath) => {
    const client = createClient();
    await client.connect(
      new StdioClientTransport({
        command: Deno.execPath(),
        args: [...SERVER_ARGS, "--no-http"],
        env: { ...Deno.env.toObject(), MCP_KV_PATH: kvPath },
        stderr: "ignore",
      }),
    );
    try {
      await exerciseClient(client);
    } finally {
      await client.close();
    }
  });
});

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
