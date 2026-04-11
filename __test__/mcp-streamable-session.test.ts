import { parseMcpPostJsonBody, planMcpStreamableAcquire } from "$/app/http/mcpStreamableSession.ts";
import { INVALID_SESSION_ID, RPC_ERROR_CODES } from "$/shared/constants.ts";

const fakeIsInit = (body: unknown) =>
  typeof body === "object" && body !== null &&
  (body as Record<string, unknown>).method === "initialize";

Deno.test("planMcpStreamableAcquire: initialize without session → create_session", () => {
  const body = { jsonrpc: "2.0", method: "initialize", id: 1, params: {} };
  const r = planMcpStreamableAcquire({ sessionId: undefined, parsedBody: body }, fakeIsInit);
  if (!r.ok) throw new Error("expected ok");
  if (r.plan.kind !== "create_session") throw new Error("expected create_session");
});

Deno.test("planMcpStreamableAcquire: non-init without session → invalid request", () => {
  const r = planMcpStreamableAcquire(
    { sessionId: undefined, parsedBody: { method: "foo" } },
    fakeIsInit,
  );
  if (r.ok) throw new Error("expected failure");
  if (r.error.code !== RPC_ERROR_CODES.INVALID_REQUEST) {
    throw new Error(`code ${r.error.code}`);
  }
});

Deno.test("planMcpStreamableAcquire: non-init with unknown session → session not found", () => {
  const sid = "00000000-0000-4000-8000-000000000099";
  const r = planMcpStreamableAcquire(
    { sessionId: sid, parsedBody: { method: "ping" } },
    fakeIsInit,
  );
  if (r.ok) throw new Error("expected failure");
  if (r.error.code !== RPC_ERROR_CODES.SESSION_NOT_FOUND) {
    throw new Error(`code ${r.error.code}`);
  }
  if (!r.error.message.includes(sid)) throw new Error("expected session id in message");
});

Deno.test("parseMcpPostJsonBody: empty → invalid request", () => {
  const r = parseMcpPostJsonBody("", INVALID_SESSION_ID);
  if (r.ok) throw new Error("expected fail");
  if (r.code !== RPC_ERROR_CODES.INVALID_REQUEST) throw new Error(String(r.code));
});

Deno.test("parseMcpPostJsonBody: invalid JSON → parse error", () => {
  const r = parseMcpPostJsonBody("{", INVALID_SESSION_ID);
  if (r.ok) throw new Error("expected fail");
  if (r.code !== RPC_ERROR_CODES.PARSE_ERROR) throw new Error(String(r.code));
});

Deno.test("parseMcpPostJsonBody: valid object", () => {
  const r = parseMcpPostJsonBody('{"a":1}', INVALID_SESSION_ID);
  if (!r.ok) throw new Error("expected ok");
  if ((r.parsed as Record<string, number>).a !== 1) throw new Error("bad parse");
});
