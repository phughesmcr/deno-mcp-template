import { delay } from "@std/async/delay";

import { closeKvStore, configureKvPath, createKvWatcher, openKvStore } from "$/kv/mod.ts";
import { COUNTER_KEY } from "$/mcp/resources/counterStore.ts";
import { assert, assertEquals, waitFor } from "./helpers.ts";

Deno.test({
  name: "KV watcher emits updates and stops on unwatch",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    const watcher = createKvWatcher();
    try {
      configureKvPath(kvPath);
      const kv = await openKvStore(kvPath);
      await kv.set(COUNTER_KEY, new Deno.KvU64(0n));

      let notificationCount = 0;
      await watcher.watch("counter://value", COUNTER_KEY, () => {
        notificationCount += 1;
      });
      await delay(50);

      await kv.atomic().sum(COUNTER_KEY, 1n).commit();
      await waitFor(() => notificationCount > 0);
      assert(notificationCount > 0, "Expected watcher to receive counter update");

      await watcher.unwatch("counter://value");
      const before = notificationCount;
      await kv.atomic().sum(COUNTER_KEY, 1n).commit();
      await delay(100);
      assertEquals(notificationCount, before);
    } finally {
      await watcher.stop();
      await closeKvStore();
      await Deno.remove(kvPath).catch(() => {});
    }
  },
});

Deno.test({
  name: "concurrent watch() for the same uri shares one KV watch stream",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    const watcher = createKvWatcher();
    try {
      configureKvPath(kvPath);
      const kv = await openKvStore(kvPath);
      await kv.set(COUNTER_KEY, new Deno.KvU64(0n));

      let notificationCount = 0;
      const onChange = (): void => {
        notificationCount += 1;
      };

      await Promise.all([
        watcher.watch("counter://value", COUNTER_KEY, onChange),
        watcher.watch("counter://value", COUNTER_KEY, onChange),
      ]);
      await delay(50);

      await kv.atomic().sum(COUNTER_KEY, 1n).commit();
      await waitFor(() => notificationCount > 0);
      assertEquals(notificationCount, 1);

      await watcher.unwatch("counter://value");
    } finally {
      await watcher.stop();
      await closeKvStore();
      await Deno.remove(kvPath).catch(() => {});
    }
  },
});
