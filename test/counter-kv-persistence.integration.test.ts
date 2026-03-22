import { closeKvStore, configureKvPath, openKvStore } from "$/app/kv/mod.ts";
import { getCounterValue, incrementCounterValue } from "$/mcp/resources/counter.ts";
import { assertEquals } from "./helpers.ts";

Deno.test({
  name: "counter persists and increments atomically in KV",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    try {
      configureKvPath(kvPath);
      await openKvStore(kvPath);

      const initialValue = await getCounterValue();
      assertEquals(initialValue, 0);

      // Run parallel increments to verify compare-and-set update safety.
      await Promise.all(Array.from({ length: 25 }, () => incrementCounterValue(1)));
      const afterParallelIncrements = await getCounterValue();
      assertEquals(afterParallelIncrements, 25);

      await closeKvStore();

      // Re-open the same KV file and verify persisted value.
      configureKvPath(kvPath);
      await openKvStore(kvPath);
      const persistedValue = await getCounterValue();
      assertEquals(persistedValue, 25);
    } finally {
      await closeKvStore();
      await Deno.remove(kvPath).catch(() => {});
    }
  },
});
