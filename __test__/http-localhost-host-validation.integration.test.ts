import { getProcessKvRuntime } from "$/kv/mod.ts";
import { createHonoApp } from "$/app/http/hono.ts";
import {
  resolveHostHeaderProtection,
  validateHostHeaderAgainstAllowlist,
} from "$/app/http/hostHeaderMiddleware.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import { assertEquals, baseHttpConfig, noopMcpHandler } from "./helpers.ts";

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
  fn: async () => {
    const app = createHonoApp({
      config: baseHttp({ hostname: "127.0.0.1" }),
      handler: noopMcpHandler,
      kv: getProcessKvRuntime(),
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
  fn: async () => {
    const app = createHonoApp({
      config: baseHttp({ hostname: "127.0.0.1" }),
      handler: noopMcpHandler,
      kv: getProcessKvRuntime(),
    });

    const res = await app.fetch(
      new Request("http://127.0.0.1:3001/", {
        headers: { "host": "localhost:3001" },
      }),
    );

    assertEquals(res.status, 200);
  },
});

Deno.test({
  name: "validateHostHeaderAgainstAllowlist matches a wildcard for one subdomain label only",
  fn: () => {
    const allowed = ["*.example.com"];
    const check = (host: string) => validateHostHeaderAgainstAllowlist(host, allowed).ok;
    assertEquals(check("app-abc123.example.com"), true);
    assertEquals(check("APP.example.com:443"), true);
    assertEquals(check("example.com"), false);
    assertEquals(check("a.b.example.com"), false);
    assertEquals(check("app.example.com.evil.test"), false);
    assertEquals(check("evilexample.com"), false);
    assertEquals(check("localhost"), false);
  },
});
