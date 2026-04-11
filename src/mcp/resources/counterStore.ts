import { getProcessKvRuntime } from "$/kv/mod.ts";
import type { KvRuntime } from "$/kv/runtime.ts";

async function openKv(kv?: KvRuntime): Promise<Deno.Kv> {
  return await (kv ?? getProcessKvRuntime()).get();
}

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

export async function getPersistedCounterValue(kv?: KvRuntime): Promise<number> {
  const store = await openKv(kv);
  const entry = await store.get<unknown>(COUNTER_KEY);
  return ensureNumber(entry.value);
}

export async function incrementPersistedCounterValue(
  delta: number,
  kv?: KvRuntime,
): Promise<number> {
  if (!Number.isSafeInteger(delta) || delta < 0) {
    throw new Error("Counter delta must be a non-negative safe integer");
  }

  const store = await openKv(kv);
  const result = await store.atomic().sum(COUNTER_KEY, BigInt(delta)).commit();
  if (!result.ok) {
    throw new Error("Failed to increment counter atomically");
  }
  const entry = await store.get<unknown>(COUNTER_KEY);
  return ensureNumber(entry.value);
}
