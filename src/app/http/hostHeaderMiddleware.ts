import type { Context, MiddlewareHandler } from "hono";

import { HTTP_STATUS } from "$/shared/constants.ts";

/** Hostnames allowed by {@link createLocalhostHostValidationMiddleware} (matches MCP SDK). */
export const SDK_LOCALHOST_ALLOWED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "[::1]",
] as const;

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

export type { HostHeaderProtectionMode } from "$/shared/httpSecurityPolicy.ts";
export { resolveHostHeaderProtection } from "$/shared/httpSecurityPolicy.ts";
