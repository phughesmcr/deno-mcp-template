import { checkDeployment } from "../scripts/smoke-deploy.ts";
import { assert, assertEquals } from "./helpers.ts";

const stub = (...responses: Array<[number, string] | Error>) => {
  let calls = 0;
  const fetchFn = (() => {
    const next = responses[Math.min(calls++, responses.length - 1)] ??
      new Error("no stubbed response");
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(new Response(next[1], { status: next[0] }));
  }) as typeof fetch;
  return { fetchFn, retryDelayMs: 0, calls: () => calls };
};

const DISCOVER = `{"result":{"supportedVersions":["2026-07-28"]}}`;

async function failure(run: Promise<string>): Promise<string> {
  try {
    await run;
  } catch (error) {
    return String(error);
  }
  throw new Error("expected a failure");
}

Deno.test("checkDeployment passes on server/discover", async () => {
  const result = await checkDeployment("https://x.test", "token", stub([200, DISCOVER]));
  assert(result.includes("2026-07-28"), result);
});

Deno.test("checkDeployment accepts a 401 only without a token", async () => {
  const result = await checkDeployment("https://x.test", undefined, stub([401, "{}"]));
  assert(result.includes("requires a token"), result);
  assert(
    (await failure(checkDeployment("https://x.test", "bad", stub([401, "{}"])))).includes("401"),
  );
});

Deno.test("checkDeployment fails at once on 403 and names the fix", async () => {
  const fake = stub([403, `{"error":{"message":"Invalid Host: x.test"}}`]);
  assert(
    (await failure(checkDeployment("https://x.test", "t", fake))).includes("MCP_ALLOWED_HOSTS"),
  );
  assertEquals(fake.calls(), 1);
});

Deno.test("checkDeployment retries while the revision comes up", async () => {
  const fake = stub(new Error("connection refused"), [503, "starting"], [200, DISCOVER]);
  await checkDeployment("https://x.test", "t", fake);
  assertEquals(fake.calls(), 3);
});

Deno.test("checkDeployment gives up after repeated 5xx", async () => {
  const fake = stub([500, "boom"]);
  assert((await failure(checkDeployment("https://x.test", "t", fake))).includes("boom"));
  assertEquals(fake.calls(), 5);
});

Deno.test("checkDeployment names no host, which would put the org slug in the log", async () => {
  const url = "https://app.secret-org.deno.net";
  const ok = await checkDeployment(url, "t", stub([200, DISCOVER]));
  assert(!ok.includes("secret-org"), ok);
  const denied = stub([403, `{"error":{"message":"Invalid Host: app.secret-org.deno.net"}}`]);
  const refused = await failure(checkDeployment(url, "t", denied));
  assert(!refused.includes("secret-org"), refused);
  const cut = stub([403, `${"x".repeat(190)}app.secret-org.deno.net`]);
  const partial = await failure(checkDeployment(url, "t", cut));
  assert(!partial.includes("app.secret"), partial);
  const down = stub(new Error("error sending request for url (https://app.secret-org.deno.net/)"));
  const unreachable = await failure(checkDeployment(url, "t", down));
  assert(!unreachable.includes("secret-org"), unreachable);
});

/** Never answers, but stops when the caller's signal fires, as `fetch` does. */
const hangingFetch = ((_url: URL, init: RequestInit) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  })) as typeof fetch;

/** Sends headers, then keeps the body open until the caller's signal fires. */
const hangingBodyFetch = ((_url: URL, init: RequestInit) => {
  const body = new ReadableStream({
    start(controller) {
      init.signal?.addEventListener("abort", () => controller.error(init.signal?.reason));
    },
  });
  return Promise.resolve(new Response(body, { status: 200 }));
}) as typeof fetch;

for (const [name, fetchFn] of [["request", hangingFetch], ["body", hangingBodyFetch]] as const) {
  Deno.test(`checkDeployment gives up on a stalled ${name}`, async () => {
    const options = { fetchFn, retryDelayMs: 0, timeoutMs: 5 };
    const message = await failure(checkDeployment("https://x.test", "t", options));
    assert(message.includes("No answer after 5 attempts"), message);
  });
}
