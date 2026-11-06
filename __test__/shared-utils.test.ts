import { getRejected } from "$/shared/utils.ts";

import { assert, assertEquals } from "./helpers.ts";

const rejected = (reason: unknown): PromiseRejectedResult => ({ status: "rejected", reason });
const fulfilled: PromiseFulfilledResult<number> = { status: "fulfilled", value: 1 };

Deno.test("getRejected returns null when nothing rejected", () => {
  assertEquals(getRejected([fulfilled]), null);
  assertEquals(getRejected([]), null);
});

Deno.test("getRejected returns a single rejection's own error", () => {
  const error = new RangeError("boom");
  assertEquals(getRejected([fulfilled, rejected(error)]), error);
});

Deno.test("getRejected wraps a non-Error rejection", () => {
  assertEquals(getRejected([rejected("boom")])?.message, "boom");
});

Deno.test("getRejected keeps every rejection in an AggregateError", () => {
  const first = new Error("first");
  const result = getRejected([rejected(first), fulfilled, rejected("second")]);
  assert(result instanceof AggregateError, "expected an AggregateError");
  assertEquals(result.errors.length, 2);
  assertEquals(result.errors[0], first);
  assertEquals(result.message, "first; second");
});
