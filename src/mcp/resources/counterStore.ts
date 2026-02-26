import { getKvStore } from "$/app/kv/mod.ts";

const COUNTER_KEY: Deno.KvKey = ["resource", "counter", "value"];

function ensureNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  throw new Error("Counter value in KV is not a number");
}

export async function getPersistedCounterValue(): Promise<number> {
  const kv = await getKvStore();
  const entry = await kv.get<unknown>(COUNTER_KEY);
  return ensureNumber(entry.value);
}

export async function incrementPersistedCounterValue(delta: number): Promise<number> {
  const kv = await getKvStore();

  for (let attempt = 0; attempt < 100; attempt++) {
    const currentEntry = await kv.get<unknown>(COUNTER_KEY);
    const current = ensureNumber(currentEntry.value);
    const next = current + delta;

    const result = await kv.atomic()
      .check({ key: COUNTER_KEY, versionstamp: currentEntry.versionstamp })
      .set(COUNTER_KEY, next)
      .commit();

    if (result.ok) return next;

    // High-contention retries: yield briefly before trying again.
    await new Promise((resolve) => setTimeout(resolve, Math.min(5, attempt + 1)));
  }

  throw new Error("Failed to increment counter after repeated retries");
}
