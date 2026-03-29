import {
  createUrlElicitationRegistry,
  URL_ELICITATION_TTL_MS,
} from "$/mcp/urlElicitation/registry.ts";
import { assert, assertEquals } from "./helpers.ts";

Deno.test("UrlElicitationRegistry completes once and invokes notifier once", async () => {
  const registry = createUrlElicitationRegistry();
  let calls = 0;
  const id = "00000000-0000-4000-8000-000000000001";
  const session = "00000000-0000-4000-8000-000000000002";

  registry.registerPending({
    elicitationId: id,
    sessionId: session,
    label: "test",
    completionNotifier: async () => {
      calls += 1;
    },
  });

  const rec = registry.getPendingForSession(id, session);
  assert(rec !== undefined);
  assertEquals(rec.label, "test");

  await registry.complete(id);
  await registry.complete(id);
  assertEquals(calls, 1);

  assert(registry.getPendingForSession(id, session) === undefined);
});

Deno.test("UrlElicitationRegistry rejects wrong session", () => {
  const registry = createUrlElicitationRegistry();
  const id = "00000000-0000-4000-8000-000000000003";
  registry.registerPending({
    elicitationId: id,
    sessionId: "00000000-0000-4000-8000-000000000004",
    label: "x",
    completionNotifier: async () => {},
  });
  assert(registry.getPendingForSession(id, "00000000-0000-4000-8000-000000009999") === undefined);
});

Deno.test("UrlElicitationRegistry cleanupExpired removes old entries", () => {
  const registry = createUrlElicitationRegistry();
  const id = "00000000-0000-4000-8000-000000000005";
  registry.registerPending({
    elicitationId: id,
    sessionId: "00000000-0000-4000-8000-000000000006",
    label: "stale",
    completionNotifier: async () => {},
  });

  const removed = registry.cleanupExpired(Date.now() + URL_ELICITATION_TTL_MS + 1);
  assertEquals(removed, 1);
  assert(
    registry.getPendingForSession(
      id,
      "00000000-0000-4000-8000-000000000006",
    ) === undefined,
  );
});
