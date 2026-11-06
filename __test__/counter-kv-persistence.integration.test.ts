import { closeKvStore, configureKvPath, getProcessKvRuntime, openKvStore } from "$/kv/mod.ts";
import {
  getPersistedCounterValue,
  incrementPersistedCounterValue,
} from "$/mcp/resources/counterStore.ts";
import { assertEquals } from "./helpers.ts";

Deno.test({
  name: "counter persists and increments atomically in KV",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    const kv = getProcessKvRuntime();
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);

      const initialValue = await getPersistedCounterValue(kv);
      assertEquals(initialValue, 0);

      // Run parallel increments to verify atomic update safety.
      await Promise.all(Array.from({ length: 25 }, () => incrementPersistedCounterValue(1, kv)));
      const afterParallelIncrements = await getPersistedCounterValue(kv);
      assertEquals(afterParallelIncrements, 25);

      await closeKvStore();

      // Re-open the same KV file and verify persisted value.
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const persistedValue = await getPersistedCounterValue(kv);
      assertEquals(persistedValue, 25);
    } finally {
      await closeKvStore();
      await Deno.remove(kvPath).catch(() => {});
    }
  },
});
