import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { KvEventStore } from "$/app/http/kvEventStore.ts";
import { INVALID_SESSION_ID, RPC_ERROR_CODES } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";
import { RPCError } from "$/shared/utils.ts";

export interface HTTPTransportManager {
  acquire(
    requestBody: string,
    sessionId?: string,
  ): Promise<WebStandardStreamableHTTPServerTransport>;
  get(sessionId: string): WebStandardStreamableHTTPServerTransport | undefined;
  releaseAll(): Promise<void>;
  close(): Promise<void>;
}

function isValidInitializeRequest(
  sessionId: string | undefined,
  requestBody: string,
):
  | { valid: true; body: unknown }
  | { valid: false; error: string; code: number } {
  if (!requestBody.length) {
    return { valid: false, error: "Empty request body", code: RPC_ERROR_CODES.INVALID_REQUEST };
  }
  try {
    const jsonBody = JSON.parse(requestBody);
    const isInit = isInitializeRequest(jsonBody);
    if (isInit) return { valid: true, body: jsonBody };
    if (!sessionId) {
      return {
        valid: false,
        error: "No valid session ID provided",
        code: RPC_ERROR_CODES.INVALID_REQUEST,
      };
    }
    return {
      valid: false,
      error: `No transport found for session ID: ${sessionId}`,
      code: RPC_ERROR_CODES.INVALID_REQUEST,
    };
  } catch {
    return {
      valid: false,
      error: "Invalid JSON in request body",
      code: RPC_ERROR_CODES.PARSE_ERROR,
    };
  }
}

/**
 * Creates an HTTP transport manager for handling MCP sessions
 * @param config - The HTTP configuration
 * @returns The HTTP transport manager
 */
export function createHTTPTransportManager(config: AppConfig["http"]): HTTPTransportManager {
  const {
    allowedHosts = [],
    allowedOrigins = [],
    enableDnsRebinding,
    jsonResponseMode,
  } = config;
  const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();
  let eventStorePromise: Promise<KvEventStore> | null = null;

  const getEventStore = async (): Promise<KvEventStore> => {
    if (!eventStorePromise) {
      eventStorePromise = KvEventStore.create();
    }
    return await eventStorePromise;
  };

  const create = async (sessionId: string = crypto.randomUUID()) => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: (id) => {
        if (!transports.has(id)) {
          transports.set(id, transport);
        }
      },
      onsessionclosed: (id) => {
        transports.delete(id);
      },
      enableJsonResponse: !!jsonResponseMode,
      eventStore: await getEventStore(),
      enableDnsRebindingProtection: !!enableDnsRebinding,
      allowedHosts,
      allowedOrigins,
    });
    transport.onerror = (_error) => {
      // Uncomment this to log transport errors - will dangerously expose tracebacks to clients
      // console.error(`MCP transport error (session: ${transport.sessionId ?? sessionId})`, error);
    };
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
    if (!validation.valid) {
      throw new RPCError({
        code: validation.code,
        message: validation.error,
        requestId: sessionId ?? INVALID_SESSION_ID,
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
