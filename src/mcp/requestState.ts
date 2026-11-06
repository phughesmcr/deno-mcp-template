/**
 * HMAC signing for the `requestState` that multi-round tools hand to the client.
 * @module
 */

import { createRequestStateCodec, type RequestStateCodec } from "@modelcontextprotocol/server";

import { REQUEST_STATE_TTL_SECONDS } from "$/shared/constants/mcp.ts";

/**
 * Builds the shared codec. State only verifies on the same method, and anyone holding it can replay
 * it until it expires: the shared bearer token identifies no client, so `clientId` is empty. Pass
 * `authInfo` to `handler.fetch` if you add per-client auth, and the binding starts to separate
 * clients. Each tool must check that the state it reads is its own. Without a `key`, a random one
 * is used, so in-flight rounds end at restart and do not cross instances.
 */
export function createRequestState(key?: string): RequestStateCodec {
  return createRequestStateCodec({
    key: key ?? crypto.getRandomValues(new Uint8Array(32)),
    ttlSeconds: REQUEST_STATE_TTL_SECONDS,
    bind: (ctx) => `${ctx.mcpReq.method}\0${ctx.http?.authInfo?.clientId ?? ""}`,
  });
}
