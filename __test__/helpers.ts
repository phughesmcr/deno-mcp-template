import { denoFileStatPort } from "$/app/denoFileStatPort.ts";
import type { McpFetchHandler } from "$/app/http/hono.ts";
import { getProcessKvRuntime } from "$/kv/mod.ts";
import type { McpServerFactoryContext } from "$/mcp/context.ts";
import { createRequestState } from "$/mcp/requestState.ts";
import type { McpConfigInput, ValidateConfigDeps } from "$/shared/config-input.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import {
  RATE_LIMIT,
  RATE_LIMIT_UNKNOWN_CLIENT,
  RATE_LIMIT_WINDOW,
} from "$/shared/constants/http.ts";
import { InMemoryServerEventBus } from "@modelcontextprotocol/server";
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

/** Stands in for the MCP handler in tests that only exercise the middleware in front of it. */
export const noopMcpHandler: McpFetchHandler = {
  fetch: () => Promise.resolve(new Response(null, { status: 204 })),
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

/** Minimal `McpServerFactoryContext` for tests. */
export function mcpFactoryContext(
  overrides: Partial<McpServerFactoryContext> = {},
): McpServerFactoryContext {
  return {
    kv: getProcessKvRuntime(),
    events: new InMemoryServerEventBus(),
    requestState: createRequestState(crypto.randomUUID() + crypto.randomUUID()),
    publicBaseUrl: undefined,
    ...overrides,
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
