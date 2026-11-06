import { createMcpHandler, type McpHttpHandler } from "@modelcontextprotocol/server";

import { createMcpServer } from "$/mcp/mod.ts";
import type { McpServerDefinition } from "$/mcp/serverDefinition.ts";
import { mcpFactoryContext } from "./helpers.ts";

export const PROTOCOL_VERSION = "2026-07-28";

/** A stateless handler over `createMcpServer`, as `createHttpServer` builds it. */
export function createTestMcpHandler(def?: McpServerDefinition): McpHttpHandler {
  const ctx = mcpFactoryContext();
  return createMcpHandler(() => createMcpServer(ctx, def), {
    legacy: "reject",
    responseMode: "json",
  });
}

/** Builds a raw 2026-07-28 JSON-RPC POST to `/mcp`. */
export function mcpRequest(
  method: string,
  params: Record<string, unknown> = {},
  options: { name?: string; id?: number } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": PROTOCOL_VERSION,
    "mcp-method": method,
  };
  if (options.name !== undefined) headers["mcp-name"] = options.name;
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: options.id ?? 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
}
