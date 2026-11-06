import type { McpServer, RequestStateCodec, ServerEventBus } from "@modelcontextprotocol/server";

import type { KvRuntime } from "$/kv/runtime.ts";

/**
 * Process state shared by every MCP server instance. Instances are short-lived (one per HTTP
 * request), so anything that must outlive a request lives here or in KV.
 */
export interface McpServerFactoryContext {
  /** Process-scoped Deno KV (same instance the app opens/closes in lifecycle). */
  kv: KvRuntime;
  /** Change events for `subscriptions/listen` streams (HTTP) and the stdio forwarder. */
  events: ServerEventBus;
  /** Signs and verifies the `requestState` that multi-round tools hand to the client. */
  requestState: RequestStateCodec;
  /** Public origin for browser links in URL-mode elicitation; unset when HTTP is disabled. */
  publicBaseUrl: string | undefined;
}

/** Builds a fresh MCP server from the shared context (see `createApp`). */
export type CreateMcpServer = (ctx: McpServerFactoryContext) => McpServer;
