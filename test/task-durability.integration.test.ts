import type { CallToolResult, Request } from "@modelcontextprotocol/sdk/types.js";
import { delay } from "@std/async/delay";

import { closeKvStore, configureKvPath, openKvStore } from "$/app/kv/mod.ts";
import { KvTaskStore } from "$/mcp/tasks/kvTaskStore.ts";
import { enqueueDelayedEchoTask, startTaskQueueWorker, stopTaskQueueWorker } from "$/mcp/tasks/queue.ts";

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

async function waitForTaskResult(
  store: KvTaskStore,
  taskId: string,
  timeoutMs = 5000,
): Promise<CallToolResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await store.getTaskResult(taskId) as CallToolResult;
    } catch {
      await delay(25);
    }
  }
  throw new Error(`Timed out waiting for task result: ${taskId}`);
}

Deno.test({
  name: "delayed task results persist across KV reopen",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      await startTaskQueueWorker();

      const taskStore = new KvTaskStore();
      const request = { method: "tools/call", params: {} } as unknown as Request;
      const task = await taskStore.createTask(
        { ttl: 60000, pollInterval: 10 },
        "req-1",
        request,
      );

      await enqueueDelayedEchoTask({
        taskId: task.taskId,
        text: "persistent hello",
        delayMs: 20,
      });

      const firstResult = await waitForTaskResult(taskStore, task.taskId);
      const firstText = firstResult.content?.[0];
      assert(firstText?.type === "text", "expected text content from delayed task");
      if (!firstText || firstText.type !== "text") {
        throw new Error("expected text content from delayed task");
      }
      assert(
        firstText.text.includes("persistent hello"),
        "expected delayed task result to include original text",
      );

      stopTaskQueueWorker();
      await closeKvStore();

      // Simulate restart: reopen KV and verify task/result are still present.
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const reopenedStore = new KvTaskStore();

      const persistedTask = await reopenedStore.getTask(task.taskId);
      assert(persistedTask !== null, "expected task metadata to persist across restart");
      if (!persistedTask) {
        throw new Error("expected task metadata to persist across restart");
      }
      assertEquals(persistedTask.status, "completed");

      const persistedResult = await reopenedStore.getTaskResult(task.taskId) as CallToolResult;
      const persistedText = persistedResult.content?.[0];
      assert(persistedText?.type === "text", "expected persisted task result text content");
      if (!persistedText || persistedText.type !== "text") {
        throw new Error("expected persisted task result text content");
      }
      assert(
        persistedText.text.includes("persistent hello"),
        "expected persisted task result to include original text",
      );
    } finally {
      stopTaskQueueWorker();
      await closeKvStore();
      await Deno.remove(kvPath).catch(() => {});
    }
  },
});
