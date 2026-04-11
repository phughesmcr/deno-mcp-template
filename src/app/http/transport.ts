import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { KvEventStore } from "$/app/http/kvEventStore.ts";
import { parseMcpPostJsonBody, planMcpStreamableAcquire } from "$/app/http/mcpStreamableSession.ts";
import { getProcessKvRuntime } from "$/kv/mod.ts";
import type { KvRuntime } from "$/kv/runtime.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import { INVALID_SESSION_ID } from "$/shared/constants.ts";
import { RPCError } from "$/shared/utils.ts";

export interface HTTPTransportManager {
  acquire(
    requestBody: string,
    sessionId?: string,
    /** When provided, session policy uses this instead of re-parsing {@linkcode requestBody}. */
    parsedBody?: unknown,
  ): Promise<WebStandardStreamableHTTPServerTransport>;
  get(sessionId: string): WebStandardStreamableHTTPServerTransport | undefined;
  releaseAll(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Creates an HTTP transport manager for handling MCP sessions
 * @param config - The HTTP configuration
 * @param deps - Optional {@link KvRuntime} for event store (defaults to process runtime).
 * @returns The HTTP transport manager
 */
export function createHTTPTransportManager(
  config: AppConfig["http"],
  deps?: { kv?: KvRuntime },
): HTTPTransportManager {
  const { jsonResponseMode } = config;
  const kvRuntime = deps?.kv ?? getProcessKvRuntime();
  const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();
  let eventStorePromise: Promise<KvEventStore> | null = null;

  const getEventStore = async (): Promise<KvEventStore> => {
    if (!eventStorePromise) {
      eventStorePromise = KvEventStore.create(kvRuntime);
    }
    return await eventStorePromise;
  };

  const create = async (sessionId: string = crypto.randomUUID()) => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: (id: string) => {
        if (!transports.has(id)) {
          transports.set(id, transport);
        }
      },
      onsessionclosed: (id: string) => {
        transports.delete(id);
      },
      enableJsonResponse: !!jsonResponseMode,
      eventStore: await getEventStore(),
    });
    transport.onerror = (_error: Error) => {
      // Uncomment this to log transport errors - will dangerously expose tracebacks to clients
      // console.error(`MCP transport error (session: ${transport.sessionId ?? sessionId})`, error);
    };
    // Store the transport immediately with the session key for quick lookup
    transports.set(sessionId, transport);
    return transport;
  };

  const acquire = async (
    requestBody: string,
    sessionId?: string,
    parsedBodyHint?: unknown,
  ) => {
    if (sessionId) {
      const transport = transports.get(sessionId);
      if (transport) return transport;
    }
    const requestId = sessionId ?? INVALID_SESSION_ID;
    const parsedBody = parsedBodyHint !== undefined ? parsedBodyHint : (() => {
      const parsed = parseMcpPostJsonBody(requestBody, requestId);
      if (!parsed.ok) {
        throw new RPCError({
          code: parsed.code,
          message: parsed.message,
          requestId,
        });
      }
      return parsed.parsed;
    })();

    const decision = planMcpStreamableAcquire(
      { sessionId, parsedBody },
      isInitializeRequest,
    );
    if (!decision.ok) {
      throw new RPCError({
        code: decision.error.code,
        message: decision.error.message,
        requestId,
      });
    }
    return await create(sessionId ?? crypto.randomUUID());
  };

  const releaseAll = async () => {
    const promises = Array.from(transports.values()).map((transport) => transport.close());
    await Promise.allSettled(promises);
    transports.clear();
  };

  const get = (sessionId: string) => transports.get(sessionId);
  const close = async () => {
    await releaseAll();
    if (eventStorePromise) {
      try {
        const store = await eventStorePromise;
        store.close();
      } finally {
        eventStorePromise = null;
      }
    }
  };

  return {
    acquire,
    get,
    releaseAll,
    close,
  };
}
