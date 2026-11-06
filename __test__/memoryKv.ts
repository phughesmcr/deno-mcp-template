import { getProcessKvRuntime, type KvRuntime } from "$/kv/mod.ts";

/** Runs `run` against a throwaway in-memory KV, wrapped as a {@link KvRuntime}. */
export async function withMemoryKv(
  run: (kv: Deno.Kv, runtime: KvRuntime) => Promise<void>,
): Promise<void> {
  using kv = await Deno.openKv(":memory:");
  const runtime: KvRuntime = {
    configurePath: () => {},
    getConfiguredPath: () => undefined,
    get: () => Promise.resolve(kv),
    open: () => Promise.resolve(kv),
    close: () => Promise.resolve(),
  };
  await run(kv, runtime);
}

/** The process KV runtime opened on a temp file. Disposing it closes KV and deletes the file. */
export async function openTempKv(): Promise<
  AsyncDisposable & { kv: Deno.Kv; path: string; runtime: KvRuntime }
> {
  const path = await Deno.makeTempFile({ suffix: ".sqlite3" });
  const runtime = getProcessKvRuntime();
  return {
    kv: await runtime.open(path),
    path,
    runtime,
    [Symbol.asyncDispose]: async () => {
      await runtime.close();
      await Deno.remove(path).catch(() => {});
    },
  };
}
