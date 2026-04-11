import type {
  QueuedMessage,
  TaskMessageQueue,
} from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";

import { getProcessKvRuntime } from "$/kv/mod.ts";
import type { KvRuntime } from "$/kv/runtime.ts";

import { createTaskMetaKey } from "./kvTaskStore.ts";

const MAX_CONCURRENCY_RETRIES = 64;

/** Per-task FIFO queue: `QueuedMessage[]` at this key. */
export const TASK_QUEUE_PREFIX = ["task", "q"] as const;

type TaskMetaExpires = {
  expiresAt?: number;
};

function createQueueKey(taskId: string): Deno.KvKey {
  return [...TASK_QUEUE_PREFIX, taskId];
}

/** Remaining ms until task meta TTL, for aligning queue key `expireIn` with the task row. */
async function getQueueExpireIn(kv: Deno.Kv, taskId: string): Promise<number | undefined> {
  const entry = await kv.get<TaskMetaExpires>(createTaskMetaKey(taskId));
  const rec = entry.value;
  if (!rec?.expiresAt) return undefined;
  const remaining = rec.expiresAt - Date.now();
  return remaining > 0 ? remaining : 1;
}

function withOptionalExpireIn<T>(
  atomic: Deno.AtomicOperation,
  key: Deno.KvKey,
  value: T,
  expireIn?: number,
): Deno.AtomicOperation {
  return expireIn ? atomic.set(key, value, { expireIn }) : atomic.set(key, value);
}

/** Deno KV `TaskMessageQueue`: one key per task, FIFO `QueuedMessage[]`, TTL aligned with task meta. */
export class KvTaskMessageQueue implements TaskMessageQueue {
  readonly #kv: KvRuntime;

  constructor(kv?: KvRuntime) {
    this.#kv = kv ?? getProcessKvRuntime();
  }

  async #getKv(): Promise<Deno.Kv> {
    return await this.#kv.get();
  }

  async enqueue(
    taskId: string,
    message: QueuedMessage,
    _sessionId?: string,
    maxSize?: number,
  ): Promise<void> {
    const kv = await this.#getKv();
    const qk = createQueueKey(taskId);

    for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt++) {
      const entry = await kv.get<QueuedMessage[]>(qk);
      const queue = entry.value ?? [];
      if (maxSize !== undefined && queue.length >= maxSize) {
        throw new Error(
          `Task message queue overflow: queue size (${queue.length}) exceeds maximum (${maxSize})`,
        );
      }
      const next = [...queue, message];
      const expireIn = await getQueueExpireIn(kv, taskId);
      const atomic = withOptionalExpireIn(
        kv.atomic().check({ key: qk, versionstamp: entry.versionstamp }),
        qk,
        next,
        expireIn,
      );
      const result = await atomic.commit();
      if (result.ok) return;
    }

    throw new Error(`Failed to enqueue task message for ${taskId}`);
  }

  async dequeue(taskId: string, _sessionId?: string): Promise<QueuedMessage | undefined> {
    const kv = await this.#getKv();
    const qk = createQueueKey(taskId);

    for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt++) {
      const entry = await kv.get<QueuedMessage[]>(qk);
      const queue = entry.value;
      if (!queue?.length) {
        return undefined;
      }

      const [first, ...rest] = queue;
      const expireIn = await getQueueExpireIn(kv, taskId);
      const versionstamp = entry.versionstamp;
      if (!versionstamp) {
        return undefined;
      }

      let atomic = kv.atomic().check({ key: qk, versionstamp });
      if (rest.length === 0) {
        atomic = atomic.delete(qk);
      } else {
        atomic = withOptionalExpireIn(atomic, qk, rest, expireIn);
      }
      const result = await atomic.commit();
      if (result.ok) {
        return first;
      }
    }

    throw new Error(`Failed to dequeue task message for ${taskId}`);
  }

  async dequeueAll(taskId: string, _sessionId?: string): Promise<QueuedMessage[]> {
    const kv = await this.#getKv();
    const qk = createQueueKey(taskId);

    for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt++) {
      const entry = await kv.get<QueuedMessage[]>(qk);
      const queue = entry.value;
      if (!queue?.length) {
        return [];
      }

      const copy = [...queue];
      const versionstamp = entry.versionstamp;
      if (!versionstamp) {
        return [];
      }

      const result = await kv.atomic()
        .check({ key: qk, versionstamp })
        .delete(qk)
        .commit();
      if (result.ok) {
        return copy;
      }
    }

    throw new Error(`Failed to dequeueAll task messages for ${taskId}`);
  }
}

/**
 * Deletes queue rows whose task meta is gone (TTL races / crashes). Returns number of keys removed.
 */
export async function cleanupOrphanTaskQueues(kvRuntime?: KvRuntime): Promise<number> {
  const runtime = kvRuntime ?? getProcessKvRuntime();
  const kvdb = await runtime.get();
  let removed = 0;
  for await (const entry of kvdb.list({ prefix: [...TASK_QUEUE_PREFIX] })) {
    const taskId = String(entry.key.at(-1) ?? "");
    if (!taskId) continue;
    const meta = await kvdb.get(createTaskMetaKey(taskId));
    if (!meta.value) {
      await kvdb.delete(entry.key);
      removed += 1;
    }
  }
  return removed;
}
