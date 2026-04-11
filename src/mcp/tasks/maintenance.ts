/**
 * KV-backed task maintenance (startup migration + periodic cleanup).
 * @module
 */

import { getProcessKvRuntime } from "$/kv/mod.ts";
import type { KvRuntime } from "$/kv/runtime.ts";
import { cleanupOrphanTaskQueues } from "$/mcp/tasks/kvTaskMessageQueue.ts";
import {
  KvTaskStore,
  migrateWorkingTaskIndexIfNeeded,
  TASK_WORKING_PREFIX,
} from "$/mcp/tasks/kvTaskStore.ts";

const STALE_TASK_THRESHOLD_MS = 15 * 60 * 1000;
const STALE_TASK_STATUS_MESSAGE = "Timed out by maintenance cron after inactivity";

export type TaskStartupMaintenanceOptions = {
  kv?: KvRuntime;
};

export type TaskPeriodicMaintenanceOptions = {
  now?: number;
  kv?: KvRuntime;
};

/** Run once after KV is open (working-index migration). */
export async function runTaskStartupMaintenance(
  options?: TaskStartupMaintenanceOptions,
): Promise<void> {
  const kv = options?.kv ?? getProcessKvRuntime();
  await migrateWorkingTaskIndexIfNeeded(kv);
}

/**
 * Periodic maintenance: fail stale working tasks and remove orphan message queues.
 * @returns Count of tasks transitioned to failed by this run.
 */
export async function runTaskPeriodicMaintenance(
  options?: TaskPeriodicMaintenanceOptions,
): Promise<number> {
  const now = options?.now ?? Date.now();
  const kvRt = options?.kv ?? getProcessKvRuntime();
  const kv = await kvRt.get();
  const taskStore = new KvTaskStore({ kv: kvRt });
  let cleanedCount = 0;
  const cutoffIso = new Date(now - STALE_TASK_THRESHOLD_MS).toISOString();

  for await (const entry of kv.list({ prefix: [...TASK_WORKING_PREFIX] })) {
    const lastUpdatedAt = String(entry.key[2] ?? "");
    if (lastUpdatedAt > cutoffIso) break;

    const taskId = String(entry.key[3] ?? "");
    if (!taskId) continue;

    try {
      await taskStore.updateTaskStatus(
        taskId,
        "failed",
        STALE_TASK_STATUS_MESSAGE,
      );
      cleanedCount += 1;
    } catch {
      // Ignore races where another worker has already finalized the task.
    }
  }

  await cleanupOrphanTaskQueues(kvRt);
  return cleanedCount;
}
