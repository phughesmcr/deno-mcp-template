import { createMcpHandler } from "@modelcontextprotocol/server";

import { createMcpServer } from "$/mcp/mod.ts";
import { mcpFactoryContext } from "../__test__/helpers.ts";

const PROTOCOL = "2026-07-28";

const handler = createMcpHandler(() => createMcpServer(mcpFactoryContext()), {
  legacy: "reject",
  responseMode: "json",
});

function toolsListRequest(): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL,
      "mcp-method": "tools/list",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL,
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
}

Deno.bench({
  name: "stateless tools/list: build server and answer one request",
  fn: async () => {
    const response = await handler.fetch(toolsListRequest());
    const payload = await response.json() as { result?: { tools?: unknown[] } };
    if (!payload.result?.tools?.length) {
      throw new Error(`expected tools in response, got ${JSON.stringify(payload).slice(0, 200)}`);
    }
  },
});
