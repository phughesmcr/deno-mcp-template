import { getKvStore } from "$/kv/mod.ts";
import {
  KvTaskStore,
  migrateWorkingTaskIndexIfNeeded,
  TASK_WORKING_PREFIX,
} from "$/mcp/tasks/kvTaskStore.ts";
const STALE_TASK_THRESHOLD_MS = 15 * 60 * 1000;
const STALE_TASK_STATUS_MESSAGE = "Timed out by maintenance cron after inactivity";

export async function cleanupStaleTasks(now: number = Date.now()): Promise<number> {
  await migrateWorkingTaskIndexIfNeeded();

  const kv = await getKvStore();
  const taskStore = new KvTaskStore();
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

  return cleanedCount;
}

let started = false;

export function startMaintenanceCrons(): void {
  if (started) return;
  started = true;

  Deno.cron("cleanup-stale-tasks", "*/15 * * * *", async () => {
    try {
      await cleanupStaleTasks();
    } catch (error) {
      console.error("Failed to run stale-task cleanup cron", error);
    }
  });
}
