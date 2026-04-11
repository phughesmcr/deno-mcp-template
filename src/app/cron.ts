import { runTaskPeriodicMaintenance } from "$/mcp/tasks/maintenance.ts";
import type { UrlElicitationRegistry } from "$/mcp/urlElicitation/registry.ts";

let started = false;

export function startMaintenanceCrons(
  deps?: { urlElicitationRegistry?: UrlElicitationRegistry },
): void {
  if (started) return;
  started = true;

  Deno.cron("cleanup-stale-tasks", "*/15 * * * *", async () => {
    try {
      await runTaskPeriodicMaintenance();
    } catch (error) {
      console.error("Failed to run task periodic maintenance cron", error);
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
