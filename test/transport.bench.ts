import { createHTTPTransportManager } from "$/app/http/transport.ts";
import { closeKvStore, openKvStore } from "$/app/kv/mod.ts";
import type { AppConfig } from "$/shared/types.ts";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

const httpConfig: AppConfig["http"] = {
  enabled: true,
  hostname: "127.0.0.1",
  port: 3001,
  headers: [],
  allowedHosts: [],
  allowedOrigins: [],
  enableDnsRebinding: false,
  jsonResponseMode: false,
};

const initializeRequestBody = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: "bench-client",
      version: "0.0.0",
    },
  },
});

Deno.bench({
  name: "transport acquire creates session from initialize",
  fn: async () => {
    await openKvStore();
    const manager = createHTTPTransportManager(httpConfig);
    try {
      const transport = await manager.acquire(initializeRequestBody);
      await transport.close();
    } finally {
      await manager.close();
      await closeKvStore();
    }
  },
});

Deno.bench({
  name: "transport acquire reuses existing session",
  fn: async () => {
    await openKvStore();
    const manager = createHTTPTransportManager(httpConfig);
    const sessionId = "bench-session-id";
    try {
      const transport = await manager.acquire(initializeRequestBody, sessionId);
      await manager.acquire("{}", sessionId);
      await transport.close();
    } finally {
      await manager.close();
      await closeKvStore();
    }
  },
});
