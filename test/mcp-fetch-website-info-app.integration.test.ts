import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { FETCH_WEBSITE_INFO_RESOURCE_URI } from "$/mcp/apps/fetchWebsiteInfoApp.ts";
import { createMcpServer } from "$/mcp/mod.ts";
import { assert, hasResultForId, InMemoryTransport, waitFor } from "./helpers.ts";

Deno.test({
  name: "MCP App resource fetch-website-info.html is registered with mcp-app mime type",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const server = createMcpServer();
    const transport = new InMemoryTransport();

    try {
      await server.connect(transport as never);

      transport.receive({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      });

      await waitFor(() => hasResultForId(transport.sentMessages, 1), { timeoutMs: 2000 });

      transport.receive({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      });

      transport.receive({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/read",
        params: { uri: FETCH_WEBSITE_INFO_RESOURCE_URI },
      });

      await waitFor(() => hasResultForId(transport.sentMessages, 2), { timeoutMs: 2000 });

      const responseRaw = transport.sentMessages.find((m) => {
        const c = m as Record<string, unknown>;
        return c.id === 2 && "result" in c;
      });
      assert(responseRaw != null && "result" in responseRaw);
      const response = responseRaw as unknown as {
        result: { contents: Array<{ mimeType?: string; text?: string }> };
      };

      const content = response.result.contents[0];
      assert(content != null, "expected one resource content item");
      assert(
        content.mimeType === RESOURCE_MIME_TYPE,
        `mimeType should be ${RESOURCE_MIME_TYPE}, got ${content.mimeType}`,
      );
      assert(
        typeof content.text === "string" && content.text.length > 100,
        "expected non-trivial HTML text",
      );
      assert(
        content.text.includes("<!DOCTYPE html>") || content.text.includes("<!doctype html>"),
        "expected HTML doctype in bundled app",
      );
    } finally {
      await server.close().catch(() => {});
    }
  },
});
