import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createHonoApp } from "$/app/http/hono.ts";
import type { AppConfig } from "$/shared/types.ts";
import { validateOrigin } from "$/shared/validation/origin.ts";
import { assertEquals, noopTransports } from "./helpers.ts";

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
    createMcpServer: () => ({}) as McpServer,
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
  name: "validateOrigin rejects wildcard *",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    let threw = false;
    try {
      validateOrigin("*");
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected validateOrigin('*') to throw");
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
