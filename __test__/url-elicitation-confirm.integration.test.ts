import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createHonoApp } from "$/app/http/hono.ts";
import type { HTTPTransportManager } from "$/app/http/transport.ts";
import { createUrlElicitationRegistry } from "$/mcp/urlElicitation/registry.ts";
import { assert, assertEquals, baseHttpConfig, noopTransports } from "./helpers.ts";

const SESSION = "00000000-0000-4000-8000-0000000000a1";

function transportsWithSession(): HTTPTransportManager {
  return {
    ...noopTransports,
    get: (id) => (id === SESSION ? {} as WebStandardStreamableHTTPServerTransport : undefined),
  };
}

Deno.test({
  name: "POST /mcp-elicitation/confirm invokes completion notifier once (confirm)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let completions = 0;
    const elicitationId = "00000000-0000-4000-8000-0000000000b1";
    const registry = createUrlElicitationRegistry();
    registry.registerPending({
      elicitationId,
      sessionId: SESSION,
      label: "demo",
      completionNotifier: async () => {
        completions += 1;
      },
    });

    const app = createHonoApp({
      createMcpServer: () => ({}) as McpServer,
      config: baseHttpConfig({ httpBearerToken: "secret" }),
      transports: transportsWithSession(),
      urlElicitationRegistry: registry,
    });

    const body = new URLSearchParams({
      session: SESSION,
      elicitation: elicitationId,
      action: "confirm",
    });

    const res = await app.fetch(
      new Request("http://localhost/mcp-elicitation/confirm", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }),
      { clientIp: "127.0.0.1" },
    );

    assertEquals(res.status, 200);
    assertEquals(completions, 1);
    const html = await res.text();
    assert(html.includes("Confirmed"), "expected confirm outcome page");
  },
});

Deno.test({
  name: "POST /mcp-elicitation/confirm invokes completion notifier once (cancel)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let completions = 0;
    const elicitationId = "00000000-0000-4000-8000-0000000000b2";
    const registry = createUrlElicitationRegistry();
    registry.registerPending({
      elicitationId,
      sessionId: SESSION,
      label: "demo",
      completionNotifier: async () => {
        completions += 1;
      },
    });

    const app = createHonoApp({
      createMcpServer: () => ({}) as McpServer,
      config: baseHttpConfig({ httpBearerToken: "secret" }),
      transports: transportsWithSession(),
      urlElicitationRegistry: registry,
    });

    const body = new URLSearchParams({
      session: SESSION,
      elicitation: elicitationId,
      action: "cancel",
    });

    const res = await app.fetch(
      new Request("http://localhost/mcp-elicitation/confirm", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }),
      { clientIp: "127.0.0.1" },
    );

    assertEquals(res.status, 200);
    assertEquals(completions, 1);
    const html = await res.text();
    assert(html.includes("Cancelled"), "expected cancel outcome page");
  },
});
