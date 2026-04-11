import { closeKvStore, configureKvPath, createProcessKvRuntime, openKvStore } from "$/kv/mod.ts";

Deno.test("createProcessKvRuntime: open then get returns same instance", async () => {
  const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
  const rt = createProcessKvRuntime();
  try {
    const a = await rt.open(kvPath);
    const b = await rt.get();
    if (a !== b) throw new Error("expected same Kv instance");
  } finally {
    await rt.close();
    await Deno.remove(kvPath).catch(() => {});
  }
});

Deno.test("createProcessKvRuntime: failed open allows retry", async () => {
  const rt = createProcessKvRuntime();
  let threw = false;
  try {
    await rt.open("/nonexistent/dir/__bad__/kv.sqlite3");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected open to fail");

  const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
  try {
    await rt.open(kvPath);
    await rt.close();
  } finally {
    await Deno.remove(kvPath).catch(() => {});
  }
});

Deno.test("createProcessKvRuntime: cannot change path while open", async () => {
  const p1 = await Deno.makeTempFile({ suffix: ".sqlite3" });
  const p2 = await Deno.makeTempFile({ suffix: ".sqlite3" });
  const rt = createProcessKvRuntime();
  try {
    await rt.open(p1);
    let threw = false;
    try {
      await rt.open(p2);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected path change to fail");
  } finally {
    await rt.close();
    await Deno.remove(p1).catch(() => {});
    await Deno.remove(p2).catch(() => {});
  }
});

Deno.test("global store helpers delegate to process runtime", async () => {
  const kvPath = await Deno.makeTempFile({ suffix: ".sqlite3" });
  try {
    configureKvPath(kvPath);
    const a = await openKvStore();
    const b = await openKvStore();
    if (a !== b) throw new Error("expected same store");
    await closeKvStore();
  } finally {
    await Deno.remove(kvPath).catch(() => {});
  }
});
