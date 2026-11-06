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
    sys: true,
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
    sys: true,
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
    sys: true,
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
    sys: true,
  },
  fn: async () => {
    await verifyRuntimePermissions(stdioOnlyConfig, definitionWithTool(false));
  },
});
