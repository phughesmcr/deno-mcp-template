import { verifyRuntimePermissions } from "$/app/permissions.ts";
import type { AppConfig } from "$/shared/types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const baseConfig: AppConfig = {
  http: {
    enabled: true,
    hostname: "127.0.0.1",
    port: 3001,
    headers: [],
    allowedHosts: [],
    allowedOrigins: [],
    enableDnsRebinding: false,
    jsonResponseMode: false,
  },
  stdio: {
    enabled: true,
  },
  kv: {},
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

Deno.test({
  name: "permission preflight does not require network permission when HTTP is disabled",
  permissions: {
    env: true,
    read: true,
    write: true,
    net: false,
    sys: true,
  },
  fn: async () => {
    const stdioOnlyConfig: AppConfig = {
      ...baseConfig,
      http: {
        ...baseConfig.http,
        enabled: false,
      },
    };

    await verifyRuntimePermissions(stdioOnlyConfig);
  },
});
