import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { KvEventStore } from "$/app/http/kvEventStore.ts";
import type { AppConfig } from "$/shared/types.ts";

export interface HTTPTransportManager {
  acquire(requestBody: string, sessionId?: string): Promise<StreamableHTTPServerTransport>;
  get(sessionId: string): StreamableHTTPServerTransport | undefined;
  releaseAll(): Promise<void>;
  close(): Promise<void>;
}

function isValidInitializeRequest(
  sessionId: string | undefined,
  requestBody: string,
): { valid: true; body: unknown } | { valid: false; error: string } {
  if (!requestBody.length) {
    return { valid: false, error: "Empty request body" };
  }
  try {
    const jsonBody = JSON.parse(requestBody);
    const isInit = isInitializeRequest(jsonBody);
    if (isInit) return { valid: true, body: jsonBody };
    if (!sessionId) return { valid: false, error: "No valid session ID provided" };
    return { valid: false, error: `No transport found for session ID: ${sessionId}` };
  } catch {
    return { valid: false, error: "Invalid JSON in request body" };
  }
}

/**
 * Creates an HTTP transport manager for handling MCP sessions
 * @param config - The HTTP configuration
 * @returns The HTTP transport manager
 */
export function createHTTPTransportManager(config: AppConfig["http"]): HTTPTransportManager {
  const { allowedHosts = [], allowedOrigins = [], enableDnsRebinding } = config;
  const transports = new Map<string, StreamableHTTPServerTransport>();
  let eventStorePromise: Promise<KvEventStore> | null = null;

  const getEventStore = async (): Promise<KvEventStore> => {
    if (!eventStorePromise) {
      eventStorePromise = KvEventStore.create();
    }
    return await eventStorePromise;
  };

  const create = async (sessionId: string = crypto.randomUUID()) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: (id) => {
        if (!transports.has(id)) {
          transports.set(id, transport);
        }
      },
      onsessionclosed: (id) => {
        transports.delete(id);
      },
      enableJsonResponse: true,
      eventStore: await getEventStore(),
      enableDnsRebindingProtection: !!enableDnsRebinding,
      allowedHosts,
      allowedOrigins,
    });
    // Store the transport immediately with the session key for quick lookup
    transports.set(sessionId, transport);
    return transport;
  };

  const acquire = async (requestBody: string, sessionId?: string) => {
    if (sessionId) {
      const transport = transports.get(sessionId);
      if (transport) return transport;
    }
    const validation = isValidInitializeRequest(sessionId, requestBody);
    if (!validation.valid) throw new Error(validation.error);
    return await create(sessionId ?? crypto.randomUUID());
  };

  const releaseAll = async () => {
    const promises = Array.from(transports.values()).map((transport) => transport.close());
    await Promise.allSettled(promises);
    transports.clear();
  };

  const get = (sessionId: string) => transports.get(sessionId);
  const close = async () => {
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
