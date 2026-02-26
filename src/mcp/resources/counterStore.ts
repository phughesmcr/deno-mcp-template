import { getKvStore } from "$/app/kv/mod.ts";

export const COUNTER_KEY: Deno.KvKey = ["resource", "counter", "value"];

function ensureNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Deno.KvU64) {
    const asNumber = Number(value.value);
    if (!Number.isSafeInteger(asNumber)) {
      throw new Error("Counter value in KV exceeds Number.MAX_SAFE_INTEGER");
    }
    return asNumber;
  }
  throw new Error("Counter value in KV is not a number");
}

export async function getPersistedCounterValue(): Promise<number> {
  const kv = await getKvStore();
  const entry = await kv.get<unknown>(COUNTER_KEY);
  return ensureNumber(entry.value);
}

export async function incrementPersistedCounterValue(delta: number): Promise<number> {
  if (!Number.isSafeInteger(delta) || delta < 0) {
    throw new Error("Counter delta must be a non-negative safe integer");
  }

  const kv = await getKvStore();
  const result = await kv.atomic().sum(COUNTER_KEY, BigInt(delta)).commit();
  if (!result.ok) {
    throw new Error("Failed to increment counter atomically");
  }
  const entry = await kv.get<unknown>(COUNTER_KEY);
  return ensureNumber(entry.value);
}
