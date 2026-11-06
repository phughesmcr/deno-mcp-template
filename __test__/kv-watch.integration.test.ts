import { delay } from "@std/async/delay";

import {
  closeKvStore,
  configureKvPath,
  createKvWatcher,
  getProcessKvRuntime,
  openKvStore,
} from "$/kv/mod.ts";
import { assert, assertEquals, waitFor } from "./helpers.ts";

const KEY: Deno.KvKey = ["watched"];
const URI = "test://watched";

Deno.test({
  name: "KV watcher emits updates and stops on unwatch",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
    const watcher = createKvWatcher(getProcessKvRuntime());
    try {
      configureKvPath(kvPath);
      const kv = await openKvStore(kvPath);
      await kv.set(KEY, new Deno.KvU64(0n));

      let notificationCount = 0;
      await watcher.watch(URI, KEY, () => {
        notificationCount += 1;
      });
      await delay(50);

      await kv.atomic().sum(KEY, 1n).commit();
      await waitFor(() => notificationCount > 0);
      assert(notificationCount > 0, "Expected watcher to receive the update");

      await watcher.unwatch(URI);
      const before = notificationCount;
      await kv.atomic().sum(KEY, 1n).commit();
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
    const watcher = createKvWatcher(getProcessKvRuntime());
    try {
      configureKvPath(kvPath);
      const kv = await openKvStore(kvPath);
      await kv.set(KEY, new Deno.KvU64(0n));

      let notificationCount = 0;
      const onChange = (): void => {
        notificationCount += 1;
      };

      await Promise.all([
        watcher.watch(URI, KEY, onChange),
        watcher.watch(URI, KEY, onChange),
      ]);
      await delay(50);

      await kv.atomic().sum(KEY, 1n).commit();
      await waitFor(() => notificationCount > 0);
      assertEquals(notificationCount, 1);

      await watcher.unwatch(URI);
    } finally {
      await watcher.stop();
      await closeKvStore();
      await Deno.remove(kvPath).catch(() => {});
    }
  },
});
