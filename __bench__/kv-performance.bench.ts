import { KvEventStore } from "$/app/http/kvEventStore.ts";
import { closeKvStore, configureKvPath, getKvStore, openKvStore } from "$/kv/mod.ts";
import { createWorkingIndexKey, KvTaskStore, TASK_META_PREFIX } from "$/mcp/tasks/kvTaskStore.ts";
import { runTaskPeriodicMaintenance } from "$/mcp/tasks/maintenance.ts";
import type { Request } from "@modelcontextprotocol/sdk/types.js";

const request = { method: "tools/call", params: {} } as unknown as Request;

Deno.bench({
  name: "kvEventStore replayEventsAfter streams without full sort",
  group: "kv",
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const store = await KvEventStore.create();
      const streamId = crypto.randomUUID();
      const ids: string[] = [];
      for (let i = 0; i < 40; i++) {
        const id = await store.storeEvent(streamId, {
          jsonrpc: "2.0",
          id: i,
          method: "ping",
        } as never);
        ids.push(id);
      }
      const pivot = ids[19]!;
      let sent = 0;
      await store.replayEventsAfter(pivot, {
        send: async () => {
          sent += 1;
        },
      });
      if (sent !== 20) {
        throw new Error(`expected 20 replayed events, got ${sent}`);
      }
    } finally {
      await closeKvStore();
      await Deno.remove(kvPath).catch(() => {});
    }
  },
});

Deno.bench({
  name: "runTaskPeriodicMaintenance uses working index after migration",
  group: "kv",
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const taskStore = new KvTaskStore();
      const kv = await getKvStore();

      const stale = await taskStore.createTask(
        { ttl: 600_000, pollInterval: 1000 },
        "req-stale",
        request,
      );
      const fresh = await taskStore.createTask(
        { ttl: 600_000, pollInterval: 1000 },
        "req-fresh",
        request,
      );

      const staleMetaKey = [...TASK_META_PREFIX, stale.taskId] as Deno.KvKey;
      const staleEntry = await kv.get(staleMetaKey);
      type Meta = {
        task: { lastUpdatedAt: string; status: string; taskId: string };
        requestId: string;
        request: unknown;
        sessionId?: string;
        expiresAt?: number;
      };
      const rec = staleEntry.value as Meta;
      const now = Date.now();
      await kv.set(staleMetaKey, {
        ...rec,
        task: {
          ...rec.task,
          status: "working",
          lastUpdatedAt: new Date(now - 20 * 60 * 1000).toISOString(),
        },
      });

      const cleaned = await runTaskPeriodicMaintenance({ now });
      if (cleaned !== 1) {
        throw new Error(`expected 1 stale cleanup, got ${cleaned}`);
      }
      const freshAfter = await taskStore.getTask(fresh.taskId);
      if (freshAfter?.status !== "working") {
        throw new Error("expected fresh task to remain working");
      }
    } finally {
      await closeKvStore();
      await Deno.remove(kvPath).catch(() => {});
    }
  },
});

Deno.bench({
  name: "working index key allocation",
  group: "kv",
  fn: () => {
    createWorkingIndexKey(new Date().toISOString(), crypto.randomUUID());
  },
});
