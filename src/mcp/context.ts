import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { KvRuntime } from "$/kv/runtime.ts";
import type { ResourceSubscriptionTracker } from "./resources/subscriptionTracker.ts";
import type { UrlElicitationRegistry } from "./urlElicitation/registry.ts";

export { createResourceSubscriptionTracker } from "./resources/subscriptionTracker.ts";
export type { ResourceSubscriptionTracker } from "./resources/subscriptionTracker.ts";

/**
 * Shared process state passed into each transport-scoped MCP server instance.
 * The subscription tracker must be shared across STDIO and all HTTP sessions so KV-backed
 * resource watches deduplicate per URI (see `createKvWatcher`).
 */
export interface McpServerFactoryContext {
  subscriptions: ResourceSubscriptionTracker;
  /** Process-scoped Deno KV (same instance the app opens/closes in lifecycle). */
  kv: KvRuntime;
  /** Browser base URL and registry for URL-mode elicitation (HTTP sessions). */
  urlElicitation: {
    baseUrl: string | undefined;
    registry: UrlElicitationRegistry;
  };
  /** Task store limits from app config (TTL clamp, etc.). */
  tasks: {
    maxTtlMs: number;
  };
}

/** Factory invoked once per STDIO process and once per HTTP MCP session (see `createApp`). */
export type CreateTransportScopedMcpServer = (ctx: McpServerFactoryContext) => McpServer;
