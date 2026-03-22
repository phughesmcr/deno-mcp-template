import type { HTTPTransportManager } from "$/app/http/transport.ts";
import type { CliOptions } from "$/app/cli.ts";
import type { AppConfig } from "$/shared/types.ts";

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
    ...overrides,
  };
}

export function baseCliOptions(overrides: Partial<CliOptions> = {}): CliOptions {
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
