import type { CallToolResult, Request } from "@modelcontextprotocol/sdk/types.js";

import { closeKvStore, configureKvPath, openKvStore } from "$/kv/mod.ts";
import { KvTaskStore } from "$/mcp/tasks/kvTaskStore.ts";
import { validateConfig } from "$/shared/validation.ts";

import { assert, assertEquals, baseCliOptions, defaultValidateConfigDeps } from "./helpers.ts";

async function withTempKv(run: () => Promise<void>): Promise<void> {
  const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
  try {
    configureKvPath(kvPath);
    await openKvStore(kvPath);
    await run();
  } finally {
    await closeKvStore();
  }
}

Deno.test({
  name: "KvTaskStore clamps requested TTL to maxTtlMs",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await withTempKv(async () => {
      const ceiling = 5_000;
      const store = new KvTaskStore({ maxTtlMs: ceiling });
      const request = { method: "tools/call", params: {} } as unknown as Request;
      const task = await store.createTask(
        { ttl: 999_999_999, pollInterval: 100 },
        "r1",
        request,
      );
      assertEquals(task.ttl, ceiling);
    });
  },
});

Deno.test({
  name: "KvTaskStore getTask and getTaskResult respect session binding",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await withTempKv(async () => {
      const store = new KvTaskStore();
      const request = { method: "tools/call", params: {} } as unknown as Request;
      const task = await store.createTask(
        { ttl: 60_000, pollInterval: 100 },
        "r2",
        request,
        "session-alpha",
      );

      assertEquals(await store.getTask(task.taskId, "session-beta"), null);
      assertEquals((await store.getTask(task.taskId, "session-alpha"))?.taskId, task.taskId);
      assertEquals(await store.getTask(task.taskId, undefined), null);

      await store.storeTaskResult(task.taskId, "completed", {
        content: [{ type: "text", text: "ok" }],
      });

      let threw = false;
      try {
        await store.getTaskResult(task.taskId, "session-beta");
      } catch {
        threw = true;
      }
      assert(threw, "wrong session should not read result");

      const result = await store.getTaskResult(task.taskId, "session-alpha") as CallToolResult;
      assertEquals(result.content?.[0]?.type, "text");
    });
  },
});

Deno.test({
  name: "KvTaskStore tasks without stored sessionId remain readable without session",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await withTempKv(async () => {
      const store = new KvTaskStore();
      const request = { method: "tools/call", params: {} } as unknown as Request;
      const task = await store.createTask(
        { ttl: 60_000, pollInterval: 100 },
        "r3",
        request,
      );
      assertEquals((await store.getTask(task.taskId, undefined))?.taskId, task.taskId);
      assertEquals((await store.getTask(task.taskId, "any-session"))?.taskId, task.taskId);
    });
  },
});

Deno.test({
  name: "validateConfig rejects maxTaskTtlMs below minimum",
  fn: () => {
    const result = validateConfig(
      baseCliOptions({ maxTaskTtlMs: 30_000 }),
      defaultValidateConfigDeps,
    );
    assertEquals(result.success, false);
    if (result.success) {
      throw new Error("expected validation failure");
    }
    assert(
      result.error.message.includes("at least"),
      "expected minimum TTL error",
    );
  },
});
