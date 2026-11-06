/**
 * Drives the real server with the SDK client over HTTP and stdio, as separate processes. Needs
 * `--allow-run`, so `deno task test:integration` runs it in its second pass.
 */
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { assert, assertEquals } from "./helpers.ts";
import {
  createClient,
  firstText,
  overHttp,
  overStdio,
  SERVER_ARGS,
  withKvPath,
} from "./mcpProtocol.ts";

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
