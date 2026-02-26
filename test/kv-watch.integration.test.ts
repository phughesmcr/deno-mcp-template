import { delay } from "@std/async/delay";

import { closeKvStore, configureKvPath, createKvWatcher, openKvStore } from "$/app/kv/mod.ts";
import { COUNTER_KEY } from "$/mcp/resources/counterStore.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function waitFor(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 1000;
  const intervalMs = options.intervalMs ?? 20;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(intervalMs);
  }
  throw new Error("Timed out waiting for condition");
}

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
