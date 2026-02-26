import type { Request } from "@modelcontextprotocol/sdk/types.js";

import { cleanupStaleTasks } from "$/app/cron.ts";
import { closeKvStore, configureKvPath, getKvStore, openKvStore } from "$/app/kv/mod.ts";
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

type TaskMetaRecord = {
  task: {
    taskId: string;
    status: string;
    lastUpdatedAt: string;
  };
};

Deno.test({
  name: "cleanupStaleTasks marks stale working tasks as failed",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const kv = await getKvStore();
      const taskStore = new KvTaskStore();
      const request = { method: "tools/call", params: {} } as unknown as Request;

      const staleTask = await taskStore.createTask(
        { ttl: 60000, pollInterval: 1000 },
        "req-stale",
        request,
      );
      const freshTask = await taskStore.createTask(
        { ttl: 60000, pollInterval: 1000 },
        "req-fresh",
        request,
      );

      const staleTaskMetaKey: Deno.KvKey = ["task", "meta", staleTask.taskId];
      const staleEntry = await kv.get<TaskMetaRecord>(staleTaskMetaKey);
      if (!staleEntry.value) {
        throw new Error("Expected stale task metadata to exist");
      }
      const now = Date.now();
      const updatedStaleRecord: TaskMetaRecord = {
        ...staleEntry.value,
        task: {
          ...staleEntry.value.task,
          status: "working",
          lastUpdatedAt: new Date(now - (16 * 60 * 1000)).toISOString(),
        },
      };
      await kv.set(staleTaskMetaKey, updatedStaleRecord);

      const cleanedCount = await cleanupStaleTasks(now);
      assertEquals(cleanedCount, 1);

      const staleTaskAfterCleanup = await taskStore.getTask(staleTask.taskId);
      const freshTaskAfterCleanup = await taskStore.getTask(freshTask.taskId);
      assert(staleTaskAfterCleanup !== null, "Expected stale task to still exist");
      assert(freshTaskAfterCleanup !== null, "Expected fresh task to still exist");
      if (!staleTaskAfterCleanup || !freshTaskAfterCleanup) {
        throw new Error("Expected tasks to be readable");
      }

      assertEquals(staleTaskAfterCleanup.status, "failed");
      assertEquals(freshTaskAfterCleanup.status, "working");
    } finally {
      await closeKvStore();
      await Deno.remove(kvPath).catch(() => {});
    }
  },
});
