import type { QueuedMessage } from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import type { Request } from "@modelcontextprotocol/sdk/types.js";

import { closeKvStore, configureKvPath, getKvStore, openKvStore } from "$/kv/mod.ts";
import {
  cleanupOrphanTaskQueues,
  KvTaskMessageQueue,
  TASK_QUEUE_PREFIX,
} from "$/mcp/tasks/kvTaskMessageQueue.ts";
import { KvTaskStore } from "$/mcp/tasks/kvTaskStore.ts";

import { assert, assertEquals } from "./helpers.ts";

function testNotification(tag: string): QueuedMessage {
  return {
    type: "notification",
    timestamp: Date.now(),
    message: {
      jsonrpc: "2.0",
      method: `test/${tag}`,
      params: {},
    },
  };
}

Deno.test({
  name: "KvTaskMessageQueue FIFO enqueue and dequeue",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const q = new KvTaskMessageQueue();
      const taskId = "fifo-task";

      await q.enqueue(taskId, testNotification("a"));
      await q.enqueue(taskId, testNotification("b"));

      const first = await q.dequeue(taskId);
      const second = await q.dequeue(taskId);
      assert(first?.type === "notification");
      assert(second?.type === "notification");
      if (first?.type !== "notification" || second?.type !== "notification") {
        throw new Error("expected notifications");
      }
      assertEquals(first.message.method, "test/a");
      assertEquals(second.message.method, "test/b");
      assertEquals(await q.dequeue(taskId), undefined);
    } finally {
      await closeKvStore();
    }
  },
});

Deno.test({
  name: "KvTaskMessageQueue enqueue throws when maxSize exceeded",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const q = new KvTaskMessageQueue();
      const taskId = "max-task";

      await q.enqueue(taskId, testNotification("1"), undefined, 2);
      await q.enqueue(taskId, testNotification("2"), undefined, 2);

      let threw = false;
      try {
        await q.enqueue(taskId, testNotification("3"), undefined, 2);
      } catch (e) {
        threw = true;
        assert(
          e instanceof Error && e.message.includes("queue overflow"),
          "expected overflow error",
        );
      }
      assert(threw, "expected third enqueue to throw");
    } finally {
      await closeKvStore();
    }
  },
});

Deno.test({
  name: "KvTaskMessageQueue dequeue on missing queue returns undefined",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const q = new KvTaskMessageQueue();
      assertEquals(await q.dequeue("no-such-task"), undefined);
    } finally {
      await closeKvStore();
    }
  },
});

Deno.test({
  name: "KvTaskMessageQueue dequeueAll returns FIFO order and clears queue",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const q = new KvTaskMessageQueue();
      const taskId = "drain-task";

      await q.enqueue(taskId, testNotification("x"));
      await q.enqueue(taskId, testNotification("y"));
      const all = await q.dequeueAll(taskId);
      assertEquals(all.length, 2);
      assert(all[0]?.type === "notification" && all[1]?.type === "notification");
      if (all[0]?.type !== "notification" || all[1]?.type !== "notification") {
        throw new Error("expected notifications");
      }
      assertEquals(all[0].message.method, "test/x");
      assertEquals(all[1].message.method, "test/y");
      assertEquals((await q.dequeueAll(taskId)).length, 0);
    } finally {
      await closeKvStore();
    }
  },
});

Deno.test({
  name: "KvTaskMessageQueue concurrent enqueues retain all messages",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const q = new KvTaskMessageQueue();
      const taskId = "concurrent-task";
      const n = 25;

      await Promise.all(
        Array.from(
          { length: n },
          (_, i) => q.enqueue(taskId, testNotification(`m${i}`), undefined, 100),
        ),
      );

      const methods = new Set<string>();
      for (let i = 0; i < n; i++) {
        const msg = await q.dequeue(taskId);
        assert(msg?.type === "notification");
        if (msg?.type === "notification") {
          methods.add(msg.message.method);
        }
      }
      assertEquals(methods.size, n);
      assertEquals(await q.dequeue(taskId), undefined);
    } finally {
      await closeKvStore();
    }
  },
});

Deno.test({
  name: "KvTaskMessageQueue shares queue across instances on same KV",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const q1 = new KvTaskMessageQueue();
      const q2 = new KvTaskMessageQueue();
      const taskId = "shared-task";

      await q1.enqueue(taskId, testNotification("from-1"));
      const out = await q2.dequeue(taskId);
      assert(out?.type === "notification");
      if (out?.type !== "notification") {
        throw new Error("expected notification");
      }
      assertEquals(out.message.method, "test/from-1");
    } finally {
      await closeKvStore();
    }
  },
});

Deno.test({
  name: "cleanupOrphanTaskQueues removes queue without task meta",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const kv = await getKvStore();
      const orphanId = "orphan-queue-task";
      const qk: Deno.KvKey = [...TASK_QUEUE_PREFIX, orphanId];
      await kv.set(qk, [testNotification("ghost")]);

      const removed = await cleanupOrphanTaskQueues();
      assertEquals(removed, 1);
      const after = await kv.get(qk);
      assertEquals(after.value, null);
    } finally {
      await closeKvStore();
    }
  },
});

Deno.test({
  name: "cleanupOrphanTaskQueues keeps queue when task meta exists",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const taskStore = new KvTaskStore();
      const q = new KvTaskMessageQueue();
      const request = { method: "tools/call", params: {} } as unknown as Request;
      const task = await taskStore.createTask(
        { ttl: 600_000, pollInterval: 1000 },
        "req-q",
        request,
      );

      await q.enqueue(task.taskId, testNotification("keep"));
      const removed = await cleanupOrphanTaskQueues();
      assertEquals(removed, 0);
      const msg = await q.dequeue(task.taskId);
      assert(msg?.type === "notification");
    } finally {
      await closeKvStore();
    }
  },
});
