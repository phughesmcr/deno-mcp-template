import { closeKvStore, configureKvPath, getProcessKvRuntime, openKvStore } from "$/kv/mod.ts";
import { incrementPersistedCounterValue } from "$/mcp/resources/counterStore.ts";
import { createUrlElicitation, resolveUrlElicitation } from "$/mcp/urlElicitation/store.ts";

async function withTempKv(run: (kv: Deno.Kv) => Promise<void>): Promise<void> {
  const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
  try {
    configureKvPath(kvPath);
    const kv = await openKvStore(kvPath);
    await run(kv);
  } finally {
    await closeKvStore();
    await Deno.remove(kvPath).catch(() => {});
  }
}

Deno.bench({
  name: "counter: 50 atomic increments",
  group: "kv",
  fn: () =>
    withTempKv(async () => {
      const runtime = getProcessKvRuntime();
      for (let i = 0; i < 50; i++) await incrementPersistedCounterValue(1, runtime);
      const final = await incrementPersistedCounterValue(0, runtime);
      if (final !== 50) throw new Error(`expected 50, got ${final}`);
    }),
});

Deno.bench({
  name: "url elicitation: create and resolve",
  group: "kv",
  fn: () =>
    withTempKv(async (kv) => {
      const id = await createUrlElicitation(kv, "bench");
      if (!await resolveUrlElicitation(kv, id, "confirmed")) {
        throw new Error("expected first resolve to succeed");
      }
      if (await resolveUrlElicitation(kv, id, "cancelled")) {
        throw new Error("expected second resolve to fail");
      }
    }),
});
