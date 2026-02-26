import type { Result } from "@modelcontextprotocol/sdk/types.js";

import { getKvStore } from "$/app/kv/mod.ts";
import { KvTaskStore } from "./kvTaskStore.ts";

type DelayedEchoQueueMessage = {
  type: "delayed-echo";
  taskId: string;
  text: string;
  delayMs: number;
};

const taskStore = new KvTaskStore();

let isWorkerRunning = false;
let workerPromise: Promise<void> | null = null;

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
  try {
    const result = createDelayedEchoResult(message.text, message.delayMs);
    await taskStore.storeTaskResult(message.taskId, "completed", result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Failed to process delayed echo";
    try {
      await taskStore.updateTaskStatus(message.taskId, "failed", reason);
    } catch {
      // ignore follow-up failures during task finalization
    }
  }
}

/** Starts the singleton KV queue worker for task execution. */
export async function startTaskQueueWorker(): Promise<void> {
  if (workerPromise) return;

  isWorkerRunning = true;
  const kv = await getKvStore();
  workerPromise = kv.listenQueue(async (payload) => {
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
}

/** Enqueues a delayed-echo task for background execution. */
export async function enqueueDelayedEchoTask(spec: {
  taskId: string;
  text: string;
  delayMs: number;
}): Promise<void> {
  const kv = await getKvStore();
  await kv.enqueue(
    {
      type: "delayed-echo",
      taskId: spec.taskId,
      text: spec.text,
      delayMs: spec.delayMs,
    } satisfies DelayedEchoQueueMessage,
    { delay: spec.delayMs },
  );
}
