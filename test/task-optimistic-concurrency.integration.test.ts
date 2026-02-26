import type { Request } from "@modelcontextprotocol/sdk/types.js";

import { closeKvStore, configureKvPath, openKvStore } from "$/app/kv/mod.ts";
import { KvTaskStore } from "$/mcp/tasks/kvTaskStore.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test({
  name: "concurrent status updates do not overwrite terminal transitions",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);

      const taskStore = new KvTaskStore();
      const request = { method: "tools/call", params: {} } as unknown as Request;
      const task = await taskStore.createTask(
        { ttl: 60000, pollInterval: 1000 },
        "req-concurrency",
        request,
      );

      await Promise.allSettled([
        taskStore.updateTaskStatus(task.taskId, "failed", "terminal transition"),
        taskStore.updateTaskStatus(task.taskId, "working", "stale overwrite"),
      ]);

      const current = await taskStore.getTask(task.taskId);
      assert(current !== null, "Expected task to exist after concurrent updates");
      if (!current) {
        throw new Error("Expected task to exist after concurrent updates");
      }

      assertEquals(current.status, "failed");
      assertEquals(current.statusMessage, "terminal transition");
    } finally {
      await closeKvStore();
      await Deno.remove(kvPath).catch(() => {});
    }
  },
});
