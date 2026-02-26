import type { Task } from "@modelcontextprotocol/sdk/types.js";

import { getKvStore } from "$/app/kv/mod.ts";
import { KvTaskStore, TASK_META_PREFIX } from "$/mcp/tasks/kvTaskStore.ts";
const STALE_TASK_THRESHOLD_MS = 15 * 60 * 1000;
const STALE_TASK_STATUS_MESSAGE = "Timed out by maintenance cron after inactivity";

type TaskLike = {
  taskId: string;
  status: Task["status"];
  lastUpdatedAt: string;
};

type TaskMetaLike = {
  task?: Partial<TaskLike>;
};

function isWorkingStaleTask(task: Partial<TaskLike>, now: number): task is TaskLike {
  if (!task.taskId || !task.lastUpdatedAt) return false;
  if (task.status !== "working") return false;
  const updatedAt = Date.parse(task.lastUpdatedAt);
  if (Number.isNaN(updatedAt)) return false;
  return now - updatedAt >= STALE_TASK_THRESHOLD_MS;
}

export async function cleanupStaleTasks(now: number = Date.now()): Promise<number> {
  const kv = await getKvStore();
  const taskStore = new KvTaskStore();
  let cleanedCount = 0;

  for await (const entry of kv.list<TaskMetaLike>({ prefix: TASK_META_PREFIX })) {
    const task = entry.value?.task ?? {};
    if (!isWorkingStaleTask(task, now)) continue;
    try {
      await taskStore.updateTaskStatus(
        task.taskId,
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
