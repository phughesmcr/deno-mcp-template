import { getProcessKvRuntime } from "$/kv/mod.ts";
import { createHonoApp } from "$/app/http/hono.ts";
import { validateHttpConfig } from "$/shared/validation/config.ts";
import {
  assertEquals,
  baseHttpConfig,
  baseMcpConfigInput,
  defaultValidateConfigDeps,
  noopMcpHandler,
} from "./helpers.ts";
import { withMemoryKv } from "./memoryKv.ts";

const secret = "test-bearer-secret-xyz";

const httpConfigWithAuth = baseHttpConfig({
  trustProxy: false,
  httpBearerToken: secret,
});

Deno.test({
  name: "POST /mcp returns 401 without bearer when token is configured",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createHonoApp({
      config: httpConfigWithAuth,
      handler: noopMcpHandler,
      kv: getProcessKvRuntime(),
    });

    const response = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { clientIp: "127.0.0.1" },
    );

    assertEquals(response.status, 401);
    const body = await response.json() as { error?: string };
    assertEquals(body.error, "unauthorized");
  },
});

Deno.test({
  name: "POST /mcp passes auth with valid Bearer and reaches MCP handler",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createHonoApp({
      config: httpConfigWithAuth,
      handler: noopMcpHandler,
      kv: getProcessKvRuntime(),
    });

    const response = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
        body: "",
      }),
      { clientIp: "127.0.0.1" },
    );

    // The no-op handler answers 204, so reaching it proves bearer auth let the request through.
    assertEquals(response.status, 204);
  },
});

Deno.test({
  name: "OPTIONS /mcp is not blocked by bearer middleware (CORS preflight)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createHonoApp({
      config: httpConfigWithAuth,
      handler: noopMcpHandler,
      kv: getProcessKvRuntime(),
    });

    const response = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "POST",
        },
      }),
      { clientIp: "127.0.0.1" },
    );

    assertEquals(response.status, 204);
  },
});

Deno.test({
  name: "GET /mcp-elicitation/confirm bypasses bearer auth",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withMemoryKv(async (_kv, kv) => {
      const app = createHonoApp({
        handler: noopMcpHandler,
        config: httpConfigWithAuth,
        kv,
        urlElicitation: true,
      });

      const url =
        "http://localhost/mcp-elicitation/confirm?elicitation=00000000-0000-4000-8000-000000000002";
      const response = await app.fetch(new Request(url), { clientIp: "127.0.0.1" });

      assertEquals(response.status, 400);
      const text = await response.text();
      if (text.includes("Unauthorized") || text.toLowerCase().includes("401")) {
        throw new Error("expected HTML error page, not auth failure");
      }
    }),
});

Deno.test({
  name: "validateHttpConfig fails when requireHttpAuth is set without token",
  fn: () => {
    const cli = baseMcpConfigInput({ requireHttpAuth: true });
    const result = validateHttpConfig(cli, defaultValidateConfigDeps);
    if (result.success) throw new Error("expected failure");
    if (!result.error.message.includes("MCP_REQUIRE_HTTP_AUTH")) {
      throw new Error(result.error.message);
    }
  },
});

Deno.test({
  name: "requests without a valid token don't use up the shared rate limit",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const app = createHonoApp({
      config: baseHttpConfig({
        httpBearerToken: secret,
        rateLimit: { enabled: true, windowMs: 60_000, limit: 2, unknownClientLimit: 2 },
      }),
      handler: noopMcpHandler,
      kv: getProcessKvRuntime(),
    });
    const post = (authorization?: string) =>
      app.fetch(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(authorization ? { authorization } : {}),
          },
          body: "{}",
        }),
        {},
      );

    for (let i = 0; i < 5; i++) {
      assertEquals((await post()).status, 401);
    }
    const authorized = `Bearer ${secret}`;
    assertEquals((await post(authorized)).status, 204);
    assertEquals((await post(authorized)).status, 204);
    assertEquals((await post(authorized)).status, 429);
  },
});
