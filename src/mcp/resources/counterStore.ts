import type { KvRuntime } from "$/kv/runtime.ts";

export const COUNTER_KEY: Deno.KvKey = ["resource", "counter", "value"];

/** Every failed attempt means another caller succeeded, so this is the concurrency it survives. */
const MAX_INCREMENT_ATTEMPTS = 64;

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

export async function getPersistedCounterValue(kv: KvRuntime): Promise<number> {
  const store = await kv.get();
  const entry = await store.get<unknown>(COUNTER_KEY);
  return ensureNumber(entry.value);
}

/** Adds `delta` and returns the value this call wrote, never one including another call's delta. */
export async function incrementPersistedCounterValue(
  delta: number,
  kv: KvRuntime,
): Promise<number> {
  if (!Number.isSafeInteger(delta) || delta < 0) {
    throw new Error("Counter delta must be a non-negative safe integer");
  }

  const store = await kv.get();
  for (let attempt = 0; attempt < MAX_INCREMENT_ATTEMPTS; attempt++) {
    const entry = await store.get<unknown>(COUNTER_KEY);
    const value = ensureNumber(entry.value) + delta;
    if (!Number.isSafeInteger(value)) {
      throw new Error("Counter value would exceed Number.MAX_SAFE_INTEGER");
    }
    const result = await store.atomic()
      .check(entry)
      .set(COUNTER_KEY, new Deno.KvU64(BigInt(value)))
      .commit();
    if (result.ok) return value;
  }
  throw new Error(`Failed to increment counter after ${MAX_INCREMENT_ATTEMPTS} attempts`);
}
