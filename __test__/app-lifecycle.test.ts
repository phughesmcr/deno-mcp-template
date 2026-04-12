import { createApp } from "$/app/app.ts";
import { createProcessKvRuntime } from "$/kv/mod.ts";
import { createMcpServer } from "$/mcp/mod.ts";
import type { AppConfig, Transport } from "$/shared/config-types.ts";
import { baseHttpConfig, baseTasksConfig } from "./helpers.ts";

function idleAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    http: {
      ...baseHttpConfig({ enabled: false }),
    },
    stdio: {
      enabled: true,
    },
    kv: {},
    tasks: baseTasksConfig(),
    ...overrides,
  };
}

Deno.test("createApp: stop without start resolves", async () => {
  const app = createApp(createMcpServer, idleAppConfig());
  await app.stop();
  if (app.isRunning()) throw new Error("expected not running");
});

Deno.test("createApp: double stop resolves", async () => {
  const app = createApp(createMcpServer, idleAppConfig());
  await app.stop();
  await app.stop();
});

Deno.test("createApp: start then stop with isolated KV (transports off)", async () => {
  const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
  const rt = createProcessKvRuntime();
  try {
    const app = createApp(
      createMcpServer,
      idleAppConfig({
        kv: { path: kvPath },
        stdio: { enabled: false },
      }),
      {
        kv: rt,
        verifyRuntimePermissions: async () => {},
        enableMaintenanceCrons: false,
      },
    );
    await app.start();
    if (!app.isRunning()) throw new Error("expected running after start");
    await app.stop();
    if (app.isRunning()) throw new Error("expected not running after stop");
    await rt.open(kvPath);
    await rt.close();
  } finally {
    await Deno.remove(kvPath).catch(() => {});
  }
});

Deno.test("createApp: failed start rolls back KV and disconnects transports", async () => {
  const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
  const rt = createProcessKvRuntime();
  const events: string[] = [];

  const failingStdio: Transport = {
    connect: () => {
      events.push("stdio:connect");
      return Promise.reject(new Error("injected stdio connect failure"));
    },
    disconnect: async () => {
      events.push("stdio:disconnect");
    },
    isEnabled: () => true,
    isRunning: () => false,
  };

  const recordingHttp: Transport = {
    connect: () => {
      events.push("http:connect");
    },
    disconnect: async () => {
      events.push("http:disconnect");
    },
    isEnabled: () => true,
    isRunning: () => false,
  };

  try {
    const app = createApp(createMcpServer, idleAppConfig({ kv: { path: kvPath } }), {
      kv: rt,
      stdio: failingStdio,
      http: recordingHttp,
      verifyRuntimePermissions: async () => {},
      enableMaintenanceCrons: false,
    });

    let threw = false;
    try {
      await app.start();
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected start to throw");
    if (app.isRunning()) throw new Error("expected not running after failed start");

    if (!events.includes("stdio:connect")) {
      throw new Error(`expected stdio connect in ${events.join(",")}`);
    }
    if (!events.includes("stdio:disconnect")) {
      throw new Error(`expected stdio disconnect after rollback, got ${events.join(",")}`);
    }
    if (!events.includes("http:disconnect")) {
      throw new Error(`expected http disconnect after rollback, got ${events.join(",")}`);
    }

    await rt.open(kvPath);
    await rt.close();
  } finally {
    await Deno.remove(kvPath).catch(() => {});
  }
});
