import type { KvRuntime } from "$/kv/runtime.ts";

/** Runs `run` against a throwaway in-memory KV, wrapped as a {@link KvRuntime}. */
export async function withMemoryKv(
  run: (kv: Deno.Kv, runtime: KvRuntime) => Promise<void>,
): Promise<void> {
  const kv = await Deno.openKv(":memory:");
  const runtime: KvRuntime = {
    configurePath: () => {},
    getConfiguredPath: () => undefined,
    get: () => Promise.resolve(kv),
    open: () => Promise.resolve(kv),
    close: () => Promise.resolve(),
  };
  try {
    await run(kv, runtime);
  } finally {
    kv.close();
  }
}
