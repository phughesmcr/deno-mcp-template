import { delay } from "@std/async/delay";

import { createKvWatcher } from "$/kv/mod.ts";
import { assertEquals, waitFor } from "./helpers.ts";
import { openTempKv } from "./memoryKv.ts";

const KEY: Deno.KvKey = ["watched"];
const URI = "test://watched";

Deno.test("KV watcher emits updates and stops on unwatch", async () => {
  await using temp = await openTempKv();
  const { kv, runtime } = temp;
  const watcher = createKvWatcher(runtime);
  await kv.set(KEY, new Deno.KvU64(0n));

  let notificationCount = 0;
  await watcher.watch(URI, KEY, () => {
    notificationCount += 1;
  });

  await kv.atomic().sum(KEY, 1n).commit();
  await waitFor(() => notificationCount > 0);

  await watcher.unwatch(URI);
  const before = notificationCount;
  await kv.atomic().sum(KEY, 1n).commit();
  await delay(100);
  assertEquals(notificationCount, before);
});

Deno.test("concurrent watch() for the same uri shares one KV watch stream", async () => {
  await using temp = await openTempKv();
  const { kv, runtime } = temp;
  const watcher = createKvWatcher(runtime);
  await kv.set(KEY, new Deno.KvU64(0n));

  let notificationCount = 0;
  const onChange = (): void => {
    notificationCount += 1;
  };

  await Promise.all([
    watcher.watch(URI, KEY, onChange),
    watcher.watch(URI, KEY, onChange),
  ]);

  await kv.atomic().sum(KEY, 1n).commit();
  await waitFor(() => notificationCount > 0);
  assertEquals(notificationCount, 1);

  await watcher.unwatch(URI);
});

Deno.test("a throwing callback is logged and does not end the watch", async () => {
  await using temp = await openTempKv();
  const { kv, runtime } = temp;
  const watcher = createKvWatcher(runtime);
  await kv.set(KEY, new Deno.KvU64(0n));

  const logged: unknown[][] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    let notificationCount = 0;
    await watcher.watch(URI, KEY, () => {
      notificationCount += 1;
      if (notificationCount === 1) throw new Error("callback failed");
    });

    await kv.atomic().sum(KEY, 1n).commit();
    await waitFor(() => notificationCount === 1);
    await kv.atomic().sum(KEY, 1n).commit();
    await waitFor(() => notificationCount === 2);
    assertEquals(logged.length, 1);
  } finally {
    console.error = consoleError;
    await watcher.stop();
  }
});

Deno.test("stop() also ends a watch that is still being set up", async () => {
  await using temp = await openTempKv();
  const { kv, runtime } = temp;
  const watcher = createKvWatcher(runtime);

  let notificationCount = 0;
  const watching = watcher.watch(URI, KEY, () => {
    notificationCount += 1;
  });
  await watcher.stop();
  await watching;

  await kv.set(KEY, new Deno.KvU64(1n));
  await delay(100);
  assertEquals(notificationCount, 0);
});
