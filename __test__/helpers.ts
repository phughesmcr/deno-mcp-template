import { denoFileStatPort } from "$/app/denoFileStatPort.ts";
import type { HTTPTransportManager } from "$/app/http/transport.ts";
import { getProcessKvRuntime } from "$/kv/mod.ts";
import type { McpServerFactoryContext, ResourceSubscriptionTracker } from "$/mcp/context.ts";
import { createUrlElicitationRegistry } from "$/mcp/urlElicitation/registry.ts";
import type { McpConfigInput, ValidateConfigDeps } from "$/shared/config-input.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import { DEFAULT_MAX_TASK_TTL_MS } from "$/shared/constants.ts";
import {
  RATE_LIMIT,
  RATE_LIMIT_UNKNOWN_CLIENT,
  RATE_LIMIT_WINDOW,
} from "$/shared/constants/http.ts";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { delay } from "@std/async/delay";

export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? "assertion failed");
  }
}

export function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

export const noopTransports: HTTPTransportManager = {
  acquire: async () => {
    throw new Error("not used");
  },
  get: () => undefined,
  releaseAll: async () => {},
  close: async () => {},
};

export function baseHttpConfig(overrides: Partial<AppConfig["http"]> = {}): AppConfig["http"] {
  return {
    enabled: true,
    hostname: "127.0.0.1",
    port: 3001,
    headers: [],
    allowedHosts: [],
    allowedOrigins: [],
    enableDnsRebinding: false,
    jsonResponseMode: false,
    rateLimit: {
      enabled: true,
      windowMs: RATE_LIMIT_WINDOW,
      limit: RATE_LIMIT,
      unknownClientLimit: RATE_LIMIT_UNKNOWN_CLIENT,
    },
    ...overrides,
  };
}

export function baseTasksConfig(overrides: Partial<AppConfig["tasks"]> = {}): AppConfig["tasks"] {
  return {
    maxTtlMs: DEFAULT_MAX_TASK_TTL_MS,
    ...overrides,
  };
}

/** Minimal `McpServerFactoryContext` for tests (URL elicitation unused). */
export function mcpFactoryContext(
  subscriptions: ResourceSubscriptionTracker,
): McpServerFactoryContext {
  return {
    subscriptions,
    kv: getProcessKvRuntime(),
    urlElicitation: {
      registry: createUrlElicitationRegistry(),
      baseUrl: undefined,
    },
    tasks: baseTasksConfig(),
  };
}

export function baseMcpConfigInput(overrides: Partial<McpConfigInput> = {}): McpConfigInput {
  return {
    http: true,
    stdio: true,
    hostname: "localhost",
    port: 3001,
    headers: [],
    allowedOrigins: [],
    allowedHosts: [],
    dnsRebinding: false,
    jsonResponse: false,
    trustProxy: false,
    requireHttpAuth: false,
    maxTaskTtlMs: DEFAULT_MAX_TASK_TTL_MS,
    ...overrides,
  };
}

/** Production file stat — use with {@link validateConfig} / {@link validateHttpConfig} in integration tests. */
export const defaultValidateConfigDeps: ValidateConfigDeps = { files: denoFileStatPort };

export async function waitFor(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 1000;
  const intervalMs = options.intervalMs ?? 20;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(intervalMs);
  }
  throw new Error("Timed out waiting for condition");
}

export function hasResultForId(messages: JSONRPCMessage[], id: number): boolean {
  return messages.some((message) => {
    const candidate = message as Record<string, unknown>;
    return candidate.id === id && "result" in candidate;
  });
}

export class InMemoryTransport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sentMessages: JSONRPCMessage[] = [];

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  async close(): Promise<void> {
    this.onclose?.();
  }

  receive(message: JSONRPCMessage): void {
    this.onmessage?.(message);
  }
}
