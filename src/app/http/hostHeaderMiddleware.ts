import type { Context, MiddlewareHandler } from "hono";

import { HTTP_STATUS, isAllInterfacesBindHostname } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";

/** Hostnames allowed by {@link createLocalhostHostValidationMiddleware} (matches MCP SDK). */
export const SDK_LOCALHOST_ALLOWED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "[::1]",
] as const;

const LOOPBACK_BIND_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

/** JSON-RPC error code used by MCP SDK host header middleware. */
const HOST_VALIDATION_JSONRPC_CODE = -32_000;

function canonicalHostnameForComparison(hostname: string): string {
  const h = hostname.trim().toLowerCase();
  if (h === "::1" || h === "[::1]") return "[::1]";
  return h;
}

function normalizeAllowedList(hostnames: readonly string[]): string[] {
  return [...new Set(hostnames.map(canonicalHostnameForComparison))];
}

/**
 * Validates the raw `Host` header (port allowed) against allowed hostnames (port-agnostic),
 * matching `@modelcontextprotocol/sdk` Express `hostHeaderValidation` behavior.
 */
/**
 * Prefer the `Host` header; if absent (common for synthetic `Request` in tests), use the URL
 * authority. Real `Deno.serve` requests include `Host`.
 */
export function resolveHostHeaderInput(c: Context): string | undefined {
  const fromHeader = c.req.header("host")?.trim();
  if (fromHeader) return fromHeader;
  try {
    const host = new URL(c.req.url).host;
    return host || undefined;
  } catch {
    return undefined;
  }
}

export function validateHostHeaderAgainstAllowlist(
  hostHeader: string | undefined,
  allowedHostnames: ReadonlySet<string> | readonly string[],
): { ok: true } | { ok: false; message: string } {
  if (!hostHeader?.trim()) {
    return { ok: false, message: "Missing Host header" };
  }
  let hostname: string;
  try {
    hostname = new URL(`http://${hostHeader}`).hostname;
  } catch {
    return { ok: false, message: `Invalid Host header: ${hostHeader}` };
  }
  const canonical = canonicalHostnameForComparison(hostname);
  let allowed: ReadonlySet<string>;
  if (allowedHostnames instanceof Set) {
    allowed = allowedHostnames;
  } else {
    allowed = new Set(
      normalizeAllowedList(allowedHostnames as readonly string[]),
    );
  }
  if (!allowed.has(canonical)) {
    return { ok: false, message: `Invalid Host: ${hostname}` };
  }
  return { ok: true };
}

function hostValidationJsonResponse(
  message: string,
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: HOST_VALIDATION_JSONRPC_CODE,
        message,
      },
      id: null,
    }),
    {
      status: HTTP_STATUS.FORBIDDEN,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/**
 * Hono middleware: DNS rebinding protection against a fixed hostname allowlist.
 * @see MCP SDK `hostHeaderValidation`
 */
export function createHostHeaderValidationMiddleware(
  allowedHostnames: readonly string[],
): MiddlewareHandler {
  const allowedSet = new Set(normalizeAllowedList(allowedHostnames));
  return async (c, next) => {
    const result = validateHostHeaderAgainstAllowlist(
      resolveHostHeaderInput(c),
      allowedSet,
    );
    if (!result.ok) {
      return hostValidationJsonResponse(result.message);
    }
    return await next();
  };
}

/**
 * Hono middleware: localhost-only Host header validation.
 * @see MCP SDK `localhostHostValidation`
 */
export function createLocalhostHostValidationMiddleware(): MiddlewareHandler {
  return createHostHeaderValidationMiddleware(SDK_LOCALHOST_ALLOWED_HOSTNAMES);
}

export type HostHeaderProtectionMode =
  | { kind: "localhost" }
  | { kind: "explicit"; allowedHostnames: string[] }
  | { kind: "none" };

/**
 * Resolves which Host-header protection to apply, aligned with MCP `createMcpHonoApp`:
 * - explicit allowlist when DNS rebinding is enabled and hosts are configured
 * - localhost allowlist when binding to a loopback address
 * - otherwise none (caller may warn on all-interfaces bind)
 */
export function resolveHostHeaderProtection(
  http: AppConfig["http"],
): HostHeaderProtectionMode {
  const { hostname, enableDnsRebinding, allowedHosts = [] } = http;
  if (enableDnsRebinding && allowedHosts.length > 0) {
    return { kind: "explicit", allowedHostnames: [...allowedHosts] };
  }
  if (LOOPBACK_BIND_HOSTNAMES.has(hostname.trim().toLowerCase())) {
    return { kind: "localhost" };
  }
  return { kind: "none" };
}

export function shouldWarnAllInterfacesBindWithoutHostAllowlist(
  http: AppConfig["http"],
): boolean {
  if (http.enableDnsRebinding && (http.allowedHosts?.length ?? 0) > 0) {
    return false;
  }
  return isAllInterfacesBindHostname(http.hostname);
}

/** True when the HTTP listen hostname is loopback-only (localhost / 127.0.0.1 / ::1). */
export function isLoopbackBindHostname(hostname: string): boolean {
  return LOOPBACK_BIND_HOSTNAMES.has(hostname.trim().toLowerCase());
}

/**
 * Warn when HTTP is exposed beyond loopback without a configured bearer token.
 */
export function shouldWarnUnauthenticatedHttp(http: AppConfig["http"]): boolean {
  if (!http.enabled) return false;
  if (http.httpBearerToken?.trim()) return false;
  return !isLoopbackBindHostname(http.hostname);
}
