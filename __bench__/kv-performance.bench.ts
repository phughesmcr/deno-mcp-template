import { incrementPersistedCounterValue } from "$/mcp/resources/counterStore.ts";
import { createUrlElicitation, resolveUrlElicitation } from "$/mcp/urlElicitation/store.ts";
import { openTempKv } from "../__test__/memoryKv.ts";

Deno.bench({
  name: "counter: 50 atomic increments",
  group: "kv",
  fn: async () => {
    await using temp = await openTempKv();
    for (let i = 0; i < 50; i++) await incrementPersistedCounterValue(1, temp.runtime);
    const final = await incrementPersistedCounterValue(0, temp.runtime);
    if (final !== 50) throw new Error(`expected 50, got ${final}`);
  },
});

Deno.bench({
  name: "url elicitation: create and resolve",
  group: "kv",
  fn: async () => {
    await using temp = await openTempKv();
    const id = await createUrlElicitation(temp.kv, "bench");
    if (!await resolveUrlElicitation(temp.kv, id, "confirmed")) {
      throw new Error("expected first resolve to succeed");
    }
    if (await resolveUrlElicitation(temp.kv, id, "cancelled")) {
      throw new Error("expected second resolve to fail");
    }
  },
});
