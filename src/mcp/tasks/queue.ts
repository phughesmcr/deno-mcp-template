import type { Result } from "@modelcontextprotocol/sdk/types.js";

import { getProcessKvRuntime } from "$/kv/mod.ts";
import type { KvRuntime } from "$/kv/runtime.ts";
import { KvTaskStore } from "./kvTaskStore.ts";

type DelayedEchoQueueMessage = {
  type: "delayed-echo";
  taskId: string;
  text: string;
  delayMs: number;
};

let taskStore: KvTaskStore | null = null;

let isWorkerRunning = false;
let workerPromise: Promise<void> | null = null;

function getQueueTaskStore(kv?: KvRuntime): KvTaskStore {
  if (!taskStore) {
    taskStore = new KvTaskStore({ kv: kv ?? getProcessKvRuntime() });
  }
  return taskStore;
}

function isDelayedEchoQueueMessage(payload: unknown): payload is DelayedEchoQueueMessage {
  if (typeof payload !== "object" || payload === null) return false;
  const value = payload as Record<string, unknown>;
  return (
    value.type === "delayed-echo" &&
    typeof value.taskId === "string" &&
    typeof value.text === "string" &&
    typeof value.delayMs === "number"
  );
}

function createDelayedEchoResult(text: string, delayMs: number): Result {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ text, delayMs }),
    }],
  };
}

async function processDelayedEchoMessage(message: DelayedEchoQueueMessage): Promise<void> {
  const store = taskStore ?? getQueueTaskStore();
  try {
    const result = createDelayedEchoResult(message.text, message.delayMs);
    await store.storeTaskResult(message.taskId, "completed", result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Failed to process delayed echo";
    try {
      await store.updateTaskStatus(message.taskId, "failed", reason);
    } catch {
      // ignore follow-up failures during task finalization
    }
  }
}

/** Starts the singleton KV queue worker for task execution. */
export async function startTaskQueueWorker(kv?: KvRuntime): Promise<void> {
  if (workerPromise) return;

  const runtime = kv ?? getProcessKvRuntime();
  getQueueTaskStore(runtime);
  const kvdb = await runtime.get();

  isWorkerRunning = true;
  workerPromise = kvdb.listenQueue(async (payload) => {
    if (!isWorkerRunning) return;
    if (!isDelayedEchoQueueMessage(payload)) return;
    await processDelayedEchoMessage(payload);
  }).catch((error) => {
    if (isWorkerRunning) {
      console.error("Task queue worker stopped unexpectedly", error);
    }
  }).finally(() => {
    workerPromise = null;
  });
}

/**
 * Stops queue processing in this process.
 * The queue listener is fully released when the shared KV store is closed.
 */
export function stopTaskQueueWorker(): void {
  isWorkerRunning = false;
  workerPromise = null;
  taskStore = null;
}

/** Enqueues a delayed-echo task for background execution. */
export async function enqueueDelayedEchoTask(
  spec: {
    taskId: string;
    text: string;
    delayMs: number;
  },
  kv?: KvRuntime,
): Promise<void> {
  const runtime = kv ?? getProcessKvRuntime();
  const kvdb = await runtime.get();
  await kvdb.enqueue(
    {
      type: "delayed-echo",
      taskId: spec.taskId,
      text: spec.text,
      delayMs: spec.delayMs,
    } satisfies DelayedEchoQueueMessage,
    { delay: spec.delayMs },
  );
}
