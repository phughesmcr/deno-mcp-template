import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { createMcpServer, createResourceSubscriptionTracker } from "$/mcp/mod.ts";
import { assert, assertEquals, hasResultForId, InMemoryTransport, waitFor } from "./helpers.ts";

Deno.test({
  name: "MCP server clears resource subscriptions when transport closes",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const subscriptions = createResourceSubscriptionTracker();
    const server = createMcpServer({ subscriptions });
    const transport = new InMemoryTransport();
    const testUri = "test://subscription-cleanup";
    assertEquals(subscriptions.isSubscribed(testUri), false);

    try {
      await server.connect(transport as never);

      transport.receive({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      });
      await waitFor(() => hasResultForId(transport.sentMessages, 1));

      transport.receive({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      });

      transport.receive({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/subscribe",
        params: {
          uri: testUri,
        },
      });
      await waitFor(() => hasResultForId(transport.sentMessages, 2));

      assert(
        subscriptions.isSubscribed(testUri),
        "Expected URI to be subscribed after resources/subscribe",
      );

      await transport.close();
      await waitFor(() => !subscriptions.isSubscribed(testUri), { timeoutMs: 2000 });

      assertEquals(subscriptions.getSubscriptions().includes(testUri), false);
    } finally {
      await server.close().catch(() => {});
    }
  },
});
