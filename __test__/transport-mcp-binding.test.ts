import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createTransportMcpConnector } from "$/app/http/transportMcpBinding.ts";

function fakeTransport(): WebStandardStreamableHTTPServerTransport {
  return {} as WebStandardStreamableHTTPServerTransport;
}

Deno.test("createTransportMcpConnector: concurrent ensure awaits single connect", async () => {
  let connectCount = 0;
  const createMcpServer = (): McpServer =>
    ({
      connect: (_t: WebStandardStreamableHTTPServerTransport) => {
        connectCount++;
        return Promise.resolve();
      },
    }) as McpServer;

  const ensure = createTransportMcpConnector(createMcpServer);
  const t = fakeTransport();
  await Promise.all([ensure(t), ensure(t), ensure(t)]);
  if (connectCount !== 1) {
    throw new Error(`expected 1 connect, got ${connectCount}`);
  }
});

Deno.test("createTransportMcpConnector: connect failure clears state; retry connects again", async () => {
  let servers = 0;
  let connectCalls = 0;
  const createMcpServer = (): McpServer => {
    const id = ++servers;
    return {
      connect: (_t: WebStandardStreamableHTTPServerTransport) => {
        connectCalls++;
        if (id === 1) return Promise.reject(new Error("first fail"));
        return Promise.resolve();
      },
    } as McpServer;
  };

  const ensure = createTransportMcpConnector(createMcpServer);
  const t = fakeTransport();

  let firstFailed = false;
  try {
    await ensure(t);
  } catch {
    firstFailed = true;
  }
  if (!firstFailed) throw new Error("expected first ensure to throw");

  await ensure(t);
  if (connectCalls !== 2) {
    throw new Error(`expected 2 connect attempts, got ${connectCalls}`);
  }
  if (servers !== 2) throw new Error(`expected 2 servers, got ${servers}`);
});

Deno.test("createTransportMcpConnector.reset clears pairing for retry", async () => {
  let connectCount = 0;
  const createMcpServer = (): McpServer =>
    ({
      connect: (_t: WebStandardStreamableHTTPServerTransport) => {
        connectCount++;
        return Promise.resolve();
      },
    }) as McpServer;

  const connector = createTransportMcpConnector(createMcpServer);
  const t = fakeTransport();
  await connector(t);
  connector.reset(t);
  await connector(t);
  if (connectCount !== 2) {
    throw new Error(`expected 2 connects after reset, got ${connectCount}`);
  }
});
