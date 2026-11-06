import {
  COUNTER_KEY,
  getPersistedCounterValue,
  incrementPersistedCounterValue,
} from "$/mcp/resources/counterStore.ts";
import { assert, assertEquals } from "./helpers.ts";
import { openTempKv } from "./memoryKv.ts";

const PARALLEL_INCREMENTS = 25;

Deno.test("counter persists and increments atomically in KV", async () => {
  await using temp = await openTempKv();
  const { path, runtime } = temp;

  assertEquals(await getPersistedCounterValue(runtime), 0);

  // Run parallel increments to verify atomic update safety.
  await Promise.all(
    Array.from({ length: PARALLEL_INCREMENTS }, () => incrementPersistedCounterValue(1, runtime)),
  );
  assertEquals(await getPersistedCounterValue(runtime), PARALLEL_INCREMENTS);

  // Re-open the same KV file and verify persisted value.
  await runtime.close();
  await runtime.open(path);
  assertEquals(await getPersistedCounterValue(runtime), PARALLEL_INCREMENTS);
});

Deno.test("parallel increments each return the value they wrote", async () => {
  await using temp = await openTempKv();
  const { kv, runtime } = temp;

  const values = await Promise.all(
    Array.from({ length: PARALLEL_INCREMENTS }, () => incrementPersistedCounterValue(1, runtime)),
  );

  assertEquals(new Set(values).size, PARALLEL_INCREMENTS);
  assertEquals(Math.max(...values), PARALLEL_INCREMENTS);
  const { value } = await kv.get(COUNTER_KEY);
  assert(value instanceof Deno.KvU64, "Expected the counter to stay a Deno.KvU64");
});

Deno.test("an increment past Number.MAX_SAFE_INTEGER fails and writes nothing", async () => {
  await using temp = await openTempKv();
  const { kv, runtime } = temp;
  await kv.set(COUNTER_KEY, new Deno.KvU64(BigInt(Number.MAX_SAFE_INTEGER)));

  const error = await incrementPersistedCounterValue(1, runtime).catch((e) => e);

  assert(error instanceof Error, "Expected the increment to fail");
  assertEquals(await getPersistedCounterValue(runtime), Number.MAX_SAFE_INTEGER);
});
