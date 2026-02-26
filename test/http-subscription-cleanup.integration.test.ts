import {
  WebStandardStreamableHTTPServerTransport,
  type WebStandardStreamableHTTPServerTransportOptions,
} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { createHonoApp } from "$/app/http/hono.ts";
import type { HTTPTransportManager } from "$/app/http/transport.ts";
import { createMcpServer, isSubscribed } from "$/mcp/mod.ts";
import { HEADER_KEYS } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";

function assert(condition: unknown, message: string): asserts condition {
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
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}

const defaultHttpConfig: AppConfig["http"] = {
  enabled: true,
  hostname: "127.0.0.1",
  port: 3001,
  headers: [],
  allowedHosts: [],
  allowedOrigins: [],
  enableDnsRebinding: false,
  jsonResponseMode: true,
};

function createTestTransportManager(config: AppConfig["http"]): HTTPTransportManager {
  const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

  const create = async (sessionId: string = crypto.randomUUID()) => {
    const options: WebStandardStreamableHTTPServerTransportOptions = {
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: (id) => {
        if (!transports.has(id)) {
          transports.set(id, transport);
        }
      },
      onsessionclosed: (id) => {
        transports.delete(id);
      },
      enableJsonResponse: !!config.jsonResponseMode,
      enableDnsRebindingProtection: !!config.enableDnsRebinding,
      allowedHosts: config.allowedHosts ?? [],
      allowedOrigins: config.allowedOrigins ?? [],
    };
    const transport = new WebStandardStreamableHTTPServerTransport(options);
    transports.set(sessionId, transport);
    return transport;
  };

  const acquire = async (
    requestBody: string,
    sessionId?: string,
  ): Promise<WebStandardStreamableHTTPServerTransport> => {
    if (sessionId) {
      const existing = transports.get(sessionId);
      if (existing) return existing;
    }

    if (!requestBody.length) {
      throw new Error("Empty request body");
    }
    const body = JSON.parse(requestBody);
    if (!isInitializeRequest(body)) {
      throw new Error("No transport found for session ID");
    }
    return await create(sessionId ?? crypto.randomUUID());
  };

  const get = (sessionId: string) => transports.get(sessionId);

  const releaseAll = async (): Promise<void> => {
    await Promise.allSettled(Array.from(transports.values()).map((transport) => transport.close()));
    transports.clear();
  };

  const close = async (): Promise<void> => {
    await releaseAll();
  };

  return {
    acquire,
    get,
    releaseAll,
    close,
  };
}

Deno.test({
  name: "HTTP DELETE session termination clears tracked resource subscriptions",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const transportManager = createTestTransportManager(defaultHttpConfig);
    const app = createHonoApp({
      createMcpServer,
      config: defaultHttpConfig,
      transports: transportManager,
    });
    const testUri = `test://http-session-cleanup/${crypto.randomUUID()}`;
    let sessionId: string | undefined;

    try {
      const initializeRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
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
        }),
      });
      const initializeResponse = await app.fetch(initializeRequest, { clientIp: "127.0.0.1" });
      assertEquals(initializeResponse.status, 200);
      sessionId = initializeResponse.headers.get(HEADER_KEYS.SESSION_ID) ?? undefined;
      assert(sessionId, "Expected session ID header on initialize response");

      const initializedRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          [HEADER_KEYS.SESSION_ID]: sessionId,
          [HEADER_KEYS.MCP_PROTOCOL_VERSION]: LATEST_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        }),
      });
      const initializedResponse = await app.fetch(initializedRequest, { clientIp: "127.0.0.1" });
      assertEquals(initializedResponse.status, 202);

      const subscribeRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          [HEADER_KEYS.SESSION_ID]: sessionId,
          [HEADER_KEYS.MCP_PROTOCOL_VERSION]: LATEST_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "resources/subscribe",
          params: {
            uri: testUri,
          },
        }),
      });
      const subscribeResponse = await app.fetch(subscribeRequest, { clientIp: "127.0.0.1" });
      assertEquals(subscribeResponse.status, 200);
      assert(isSubscribed(testUri), "Expected URI to be subscribed before DELETE /mcp");

      const deleteRequest = new Request("http://localhost/mcp", {
        method: "DELETE",
        headers: {
          "accept": "application/json, text/event-stream",
          [HEADER_KEYS.SESSION_ID]: sessionId,
          [HEADER_KEYS.MCP_PROTOCOL_VERSION]: LATEST_PROTOCOL_VERSION,
        },
      });
      const deleteResponse = await app.fetch(deleteRequest, { clientIp: "127.0.0.1" });
      assertEquals(deleteResponse.status, 200);

      await waitFor(() => !isSubscribed(testUri), { timeoutMs: 2000 });
    } finally {
      await transportManager.close();
      if (sessionId) {
        await waitFor(() => !isSubscribed(testUri), { timeoutMs: 2000 }).catch(() => {});
      }
    }
  },
});

Deno.test({
  name: "HTTP initialize rejects requests that do not accept event streams",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const transportManager = createTestTransportManager(defaultHttpConfig);
    const app = createHonoApp({
      createMcpServer,
      config: defaultHttpConfig,
      transports: transportManager,
    });

    try {
      const initializeRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
        },
        body: JSON.stringify({
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
        }),
      });

      const response = await app.fetch(initializeRequest, { clientIp: "127.0.0.1" });
      assertEquals(response.status, 406);
      assertEquals(response.headers.get(HEADER_KEYS.SESSION_ID), null);

      const payload = await response.json() as {
        error?: { code?: number; message?: string };
      };
      assertEquals(payload.error?.code, -32000);
      assertEquals(
        payload.error?.message,
        "Not Acceptable: Client must accept both application/json and text/event-stream",
      );
    } finally {
      await transportManager.close();
    }
  },
});
