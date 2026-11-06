/** Runs the real server as a separate process and connects the SDK client to it. */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { delay } from "@std/async/delay";

type ClientCapabilities = NonNullable<ConstructorParameters<typeof Client>[1]>["capabilities"];

export const SERVER_ARGS = ["run", "-A", "main.ts"];

export function createClient(capabilities: ClientCapabilities = {}): Client {
  return new Client({ name: "protocol-test", version: "1.0.0" }, {
    capabilities,
    versionNegotiation: { mode: { pin: "2026-07-28" } },
  });
}

/** A client that opens with `initialize`, as a 2025-era client does. */
export function createLegacyClient(capabilities: ClientCapabilities = {}): Client {
  return new Client({ name: "protocol-test", version: "1.0.0" }, { capabilities });
}

export function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const [block] = result.content ?? [];
  return block?.type === "text" ? block.text : "";
}

export async function withKvPath(run: (kvPath: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir();
  try {
    await run(`${dir}/test.kv`);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

export function freePort(): number {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const { port } = listener.addr;
  listener.close();
  return port;
}

/** Resolves once anything answers on `url`. */
export async function waitForHttp(url: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ready = await fetch(url).then(async (response) => {
      await response.body?.cancel();
      return true;
    }, () => false);
    if (ready) return;
    await delay(50);
  }
  throw new Error(`nothing answered on ${url}`);
}

/** Connects `client` to a server on a free port, runs `exercise`, then stops the server. */
export async function overHttp(
  client: Client,
  exercise: (client: Client) => Promise<void>,
): Promise<void> {
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
      await waitForHttp(url);
      await client.connect(new StreamableHTTPClientTransport(new URL(url)));
      try {
        await exercise(client);
      } finally {
        await client.close();
      }
    } finally {
      server.kill();
      await server.status;
    }
  });
}

/** Connects `client` to a server over stdio, runs `exercise`, then closes it. */
export async function overStdio(
  client: Client,
  exercise: (client: Client) => Promise<void>,
  serverArgs: string[] = [],
): Promise<void> {
  await withKvPath(async (kvPath) => {
    await client.connect(
      new StdioClientTransport({
        command: Deno.execPath(),
        args: [...SERVER_ARGS, "--no-http", ...serverArgs],
        env: { ...Deno.env.toObject(), MCP_KV_PATH: kvPath },
        stderr: "ignore",
      }),
    );
    try {
      await exercise(client);
    } finally {
      await client.close();
    }
  });
}
