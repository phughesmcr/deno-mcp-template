import { COUNTER_URI } from "./counter.ts";
import { COUNTER_KEY } from "./counterStore.ts";

export const RESOURCE_KV_KEYS: ReadonlyMap<string, Deno.KvKey> = new Map([
  [COUNTER_URI, COUNTER_KEY],
]);
