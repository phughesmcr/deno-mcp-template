import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createHonoApp } from "$/app/http/hono.ts";
import type { HTTPTransportManager } from "$/app/http/transport.ts";
import type { AppConfig } from "$/shared/types.ts";
import { validateOrigin } from "$/shared/validation/origin.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const noopTransports: HTTPTransportManager = {
  acquire: async () => {
    throw new Error("not used in origin normalization tests");
  },
  get: () => undefined,
  releaseAll: async () => {},
  close: async () => {},
};

function createAppWithAllowedOrigin(origin: string) {
  const httpConfig: AppConfig["http"] = {
    enabled: true,
    hostname: "127.0.0.1",
    port: 3001,
    headers: [],
    allowedHosts: [],
    allowedOrigins: [origin],
    enableDnsRebinding: false,
    jsonResponseMode: false,
  };

  return createHonoApp({
    mcp: {} as McpServer,
    config: httpConfig,
    transports: noopTransports,
  });
}

Deno.test({
  name: "validateOrigin canonicalizes scheme-less origins",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    assertEquals(validateOrigin("localhost:3000"), "http://localhost:3000");
  },
});

Deno.test({
  name: "CORS matches canonicalized configured origins against browser Origin header",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const normalized = validateOrigin("localhost:3000");
    const app = createAppWithAllowedOrigin(normalized);

    const response = await app.fetch(
      new Request("http://localhost/", {
        method: "GET",
        headers: {
          origin: "http://localhost:3000",
        },
      }),
      { clientIp: "127.0.0.1" },
    );

    assertEquals(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
  },
});
