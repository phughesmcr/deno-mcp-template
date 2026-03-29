import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createHonoApp } from "$/app/http/hono.ts";
import {
  resolveHostHeaderProtection,
  validateHostHeaderAgainstAllowlist,
} from "$/app/http/hostHeaderMiddleware.ts";
import type { AppConfig } from "$/shared/types.ts";
import { assertEquals, baseHttpConfig, noopTransports } from "./helpers.ts";

function baseHttp(overrides: Partial<AppConfig["http"]> = {}): AppConfig["http"] {
  return baseHttpConfig({ jsonResponseMode: true, ...overrides });
}

Deno.test({
  name: "validateHostHeaderAgainstAllowlist matches MCP SDK (port-agnostic, IPv6)",
  fn: () => {
    assertEquals(
      validateHostHeaderAgainstAllowlist("localhost:3001", ["localhost"]).ok,
      true,
    );
    assertEquals(
      validateHostHeaderAgainstAllowlist("127.0.0.1:3001", ["127.0.0.1"]).ok,
      true,
    );
    assertEquals(
      validateHostHeaderAgainstAllowlist("[::1]:3001", ["::1"]).ok,
      true,
    );
    assertEquals(
      validateHostHeaderAgainstAllowlist("[::1]:3001", ["[::1]"]).ok,
      true,
    );
    assertEquals(
      validateHostHeaderAgainstAllowlist("evil.test", ["localhost"]).ok,
      false,
    );
  },
});

Deno.test({
  name: "resolveHostHeaderProtection: loopback bind uses localhost mode",
  fn: () => {
    assertEquals(
      resolveHostHeaderProtection(baseHttp({ hostname: "localhost" })).kind,
      "localhost",
    );
    assertEquals(resolveHostHeaderProtection(baseHttp({ hostname: "::1" })).kind, "localhost");
  },
});

Deno.test({
  name: "resolveHostHeaderProtection: dns rebinding with hosts uses explicit allowlist",
  fn: () => {
    const mode = resolveHostHeaderProtection(
      baseHttp({
        hostname: "0.0.0.0",
        enableDnsRebinding: true,
        allowedHosts: ["app.internal"],
      }),
    );
    assertEquals(mode.kind, "explicit");
    if (mode.kind === "explicit") {
      assertEquals(mode.allowedHostnames.length, 1);
      assertEquals(mode.allowedHostnames[0], "app.internal");
    }
  },
});

Deno.test({
  name: "loopback bind rejects forged Host header before MCP handler",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createHonoApp({
      createMcpServer: () => ({}) as McpServer,
      config: baseHttp({ hostname: "127.0.0.1" }),
      transports: noopTransports,
    });

    const res = await app.fetch(
      new Request("http://127.0.0.1:3001/mcp", {
        method: "POST",
        headers: {
          "host": "rebinding.attacker",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );

    assertEquals(res.status, 403);
    const body = await res.json() as {
      jsonrpc: string;
      error: { code: number; message: string };
    };
    assertEquals(body.jsonrpc, "2.0");
    assertEquals(body.error.code, -32_000);
  },
});

Deno.test({
  name: "loopback bind allows localhost Host with port",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createHonoApp({
      createMcpServer: () => ({}) as McpServer,
      config: baseHttp({ hostname: "127.0.0.1" }),
      transports: noopTransports,
    });

    const res = await app.fetch(
      new Request("http://127.0.0.1:3001/", {
        headers: { "host": "localhost:3001" },
      }),
    );

    assertEquals(res.status, 200);
  },
});
