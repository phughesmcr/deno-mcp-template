import { verifyRuntimePermissions } from "$/app/permissions.ts";
import type { McpServerDefinition } from "$/mcp/serverDefinition.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import { assert, baseHttpConfig } from "./helpers.ts";

const baseConfig: AppConfig = {
  http: baseHttpConfig(),
  stdio: {
    enabled: true,
  },
  kv: {},
  mcp: {},
};

Deno.test({
  name: "permission preflight passes with required permissions granted",
  permissions: {
    env: true,
    read: true,
    write: true,
    net: true,
    sys: false,
  },
  fn: async () => {
    await verifyRuntimePermissions(baseConfig);
  },
});

Deno.test({
  name: "permission preflight reports missing network permission when HTTP is enabled",
  permissions: {
    env: true,
    read: true,
    write: true,
    net: false,
    sys: false,
  },
  fn: async () => {
    let error: unknown;
    try {
      await verifyRuntimePermissions(baseConfig);
    } catch (err) {
      error = err;
    }

    assert(error instanceof Error, "expected permission preflight to throw");
    const errorMessage = error instanceof Error ? error.message : "";
    assert(
      errorMessage.includes("--allow-net"),
      "expected missing permission message to include --allow-net guidance",
    );
  },
});

const stdioOnlyConfig: AppConfig = {
  ...baseConfig,
  http: { ...baseConfig.http, enabled: false },
};

function definitionWithTool(requiresNet: boolean): McpServerDefinition {
  return {
    prompts: [],
    resources: [],
    tools: [{ name: "stub", runtime: { requiresNet }, register: () => {} }],
    resourceSubscribe: false,
    apps: [],
    urlElicitation: false,
  };
}

Deno.test({
  name: "permission preflight requires network when HTTP is disabled but a tool needs it",
  permissions: {
    env: true,
    read: true,
    write: true,
    net: false,
    sys: false,
  },
  fn: async () => {
    let error: unknown;
    try {
      await verifyRuntimePermissions(stdioOnlyConfig, definitionWithTool(true));
    } catch (err) {
      error = err;
    }

    assert(error instanceof Error, "expected permission preflight to throw");
    const errorMessage = error instanceof Error ? error.message : "";
    assert(
      errorMessage.includes("--allow-net"),
      "expected missing permission message to include --allow-net guidance",
    );
  },
});

Deno.test({
  name: "permission preflight does not require network when nothing needs it",
  permissions: {
    env: true,
    read: true,
    write: true,
    net: false,
    sys: false,
  },
  fn: async () => {
    await verifyRuntimePermissions(stdioOnlyConfig, definitionWithTool(false));
  },
});

Deno.test({
  name: "permission preflight accepts scoped flags on a server with no networked tools",
  permissions: {
    env: true,
    read: ["static", "/tmp/kv"],
    write: ["/tmp/kv"],
    net: ["localhost:3001"],
    sys: false,
  },
  fn: async () => {
    const config: AppConfig = {
      ...baseConfig,
      http: { ...baseConfig.http, hostname: "localhost", port: 3001 },
      kv: { path: "/tmp/kv/test.kv" },
    };
    await verifyRuntimePermissions(config, definitionWithTool(false));
  },
});

Deno.test({
  name: "permission preflight names the configured KV path when writes to it are refused",
  permissions: { env: true, read: true, write: false, net: true, sys: false },
  fn: async () => {
    const config: AppConfig = { ...baseConfig, kv: { path: "/tmp/kv/test.kv" } };
    const error = await verifyRuntimePermissions(config).then(() => null, (err) => err);
    assert(error instanceof Error, "expected permission preflight to throw");
    assert(error.message.includes("--allow-write=/tmp/kv/test.kv"), error.message);
  },
});
