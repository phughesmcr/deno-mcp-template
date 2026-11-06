import { InMemoryServerEventBus, type McpServer } from "@modelcontextprotocol/server";
import { deadline } from "@std/async/deadline";
import { delay } from "@std/async/delay";

import { createHttpServer } from "$/app/http/mod.ts";
import { createMcpServer } from "$/mcp/mod.ts";
import { assert, assertEquals, baseHttpConfig, mcpFactoryContext } from "./helpers.ts";
import { mcpRequest } from "./mcpHttp.ts";
import { freePort } from "./mcpProtocol.ts";
import { withMemoryKv } from "./memoryKv.ts";

async function withHttpServer(
  run: (http: ReturnType<typeof createHttpServer>, url: string) => Promise<void>,
  decorate: (server: McpServer) => McpServer = (server) => server,
): Promise<void> {
  await withMemoryKv(async (_kv, kv) => {
    const port = freePort();
    const events = new InMemoryServerEventBus();
    const ctx = mcpFactoryContext({ kv, events });
    const http = createHttpServer(
      () => decorate(createMcpServer(ctx)),
      baseHttpConfig({
        port,
        rateLimit: { enabled: false, windowMs: 1, limit: 1, unknownClientLimit: 1 },
      }),
      { kv, events },
    );
    http.connect();
    try {
      await run(http, `http://127.0.0.1:${port}/mcp`);
    } finally {
      await http.disconnect();
    }
  });
}

function post(
  url: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Response> {
  return fetch(new Request(url, mcpRequest(method, params)));
}

Deno.test("disconnect closes open listen streams instead of waiting on them", async () => {
  await withHttpServer(async (http, url) => {
    const response = await post(url, "subscriptions/listen", {
      notifications: { toolsListChanged: true },
    });
    assertEquals(response.status, 200);
    const reader = response.body?.getReader();
    assert(reader, "expected a stream");
    await reader.read();

    await deadline(http.disconnect(), 5_000);

    while (!(await reader.read()).done);
    assert(!http.isRunning(), "still running");
    const refused = await fetch(url).then(() => false, () => true);
    assert(refused, "still accepting connections");
  });
});

Deno.test("the listener stops accepting before the handler closes", async () => {
  const toolStarted = Promise.withResolvers<void>();
  /** An in-flight call, on a server that takes a moment to close, keeps `handler.close()` busy. */
  const slowToClose = (server: McpServer): McpServer => {
    server.registerTool("hang", {}, () => {
      toolStarted.resolve();
      return new Promise(() => {});
    });
    const close = server.server.close.bind(server.server);
    server.server.close = () => delay(100).then(close);
    return server;
  };

  await withHttpServer(async (http, url) => {
    const hanging = fetch(
      new Request(url, mcpRequest("tools/call", { name: "hang" }, { name: "hang" })),
    ).then((response) => response.body?.cancel(), () => {});
    await toolStarted.promise;

    const stopping = http.disconnect();
    const late = await post(url, "tools/list").then(async (response) => {
      await response.body?.cancel();
      return response.status;
    }, () => "refused");

    assertEquals(late, "refused");
    await stopping;
    await hanging;
  }, slowToClose);
});
