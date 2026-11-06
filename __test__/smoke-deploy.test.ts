import { checkDeployment } from "../scripts/smoke-deploy.ts";
import { assert, assertEquals } from "./helpers.ts";

const stub = (...responses: Array<[number, string] | Error>) => {
  let calls = 0;
  const fetchFn = (() => {
    const next = responses[Math.min(calls++, responses.length - 1)]!;
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
