import { getKvStore } from "$/kv/mod.ts";
import { cleanupOrphanTaskQueues } from "$/mcp/tasks/kvTaskMessageQueue.ts";
import { KvTaskStore, TASK_WORKING_PREFIX } from "$/mcp/tasks/kvTaskStore.ts";
import type { UrlElicitationRegistry } from "$/mcp/urlElicitation/registry.ts";
const STALE_TASK_THRESHOLD_MS = 15 * 60 * 1000;
const STALE_TASK_STATUS_MESSAGE = "Timed out by maintenance cron after inactivity";

export async function cleanupStaleTasks(now: number = Date.now()): Promise<number> {
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

export function startMaintenanceCrons(
  deps?: { urlElicitationRegistry?: UrlElicitationRegistry },
): void {
  if (started) return;
  started = true;

  Deno.cron("cleanup-stale-tasks", "*/15 * * * *", async () => {
    try {
      await cleanupStaleTasks();
    } catch (error) {
      console.error("Failed to run stale-task cleanup cron", error);
      return;
    }
    try {
      await cleanupOrphanTaskQueues();
    } catch (error) {
      console.error("Failed to clean up orphan task message queues", error);
    }
  });

  const registry = deps?.urlElicitationRegistry;
  if (registry) {
    Deno.cron("cleanup-expired-url-elicitations", "*/10 * * * *", () => {
      try {
        registry.cleanupExpired();
      } catch (error) {
        console.error("Failed to run URL elicitation TTL cleanup cron", error);
      }
    });
  }
}
