import { type JSONRPCMessage, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { delay } from "@std/async/delay";

import { createMcpServer, getSubscriptions, isSubscribed } from "$/mcp/mod.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function waitFor(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 1000;
  const intervalMs = options.intervalMs ?? 20;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(intervalMs);
  }
  throw new Error("Timed out waiting for condition");
}

function hasResultForId(messages: JSONRPCMessage[], id: number): boolean {
  return messages.some((message) => {
    const candidate = message as Record<string, unknown>;
    return candidate.id === id && "result" in candidate;
  });
}

class InMemoryTransport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sentMessages: JSONRPCMessage[] = [];

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  async close(): Promise<void> {
    this.onclose?.();
  }

  receive(message: JSONRPCMessage): void {
    this.onmessage?.(message);
  }
}

Deno.test({
  name: "MCP server clears resource subscriptions when transport closes",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const server = createMcpServer();
    const transport = new InMemoryTransport();
    const testUri = "test://subscription-cleanup";
    assertEquals(isSubscribed(testUri), false);

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

      assert(isSubscribed(testUri), "Expected URI to be subscribed after resources/subscribe");

      await transport.close();
      await waitFor(() => !isSubscribed(testUri), { timeoutMs: 2000 });

      assertEquals(getSubscriptions().includes(testUri), false);
    } finally {
      await server.close().catch(() => {});
    }
  },
});
