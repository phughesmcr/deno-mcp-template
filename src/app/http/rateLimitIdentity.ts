import { HEADER_KEYS } from "$/shared/constants.ts";

export type RateLimitIdentity =
  | { type: "ip"; value: string }
  | { type: "session"; value: string }
  | { type: "unknown" };

function isPlausibleIpv4(s: string): boolean {
  const parts = s.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    if (n < 0 || n > 255) return false;
    if (p.length > 1 && p.startsWith("0")) return false;
  }
  return true;
}

function isPlausibleIpv6(s: string): boolean {
  let t = s.trim();
  if (t.startsWith("[") && t.endsWith("]")) t = t.slice(1, -1);
  if (!t.includes(":") || t.length > 45) return false;
  return /^[0-9a-fA-F:]+$/.test(t);
}

function normalizeClientIpCandidate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!t || t === "unknown") return undefined;
  if (isPlausibleIpv4(t)) return t;
  if (isPlausibleIpv6(t)) return t;
  return undefined;
}

/**
 * Parses a client IP from reverse-proxy headers. Only call when {@linkcode trustProxy} is enabled.
 * Precedence: `cf-connecting-ip`, first hop of `x-forwarded-for`, `x-real-ip`.
 */
export function parseClientIpFromProxyHeaders(
  getHeader: (name: string) => string | undefined,
): string | undefined {
  const cf = normalizeClientIpCandidate(getHeader("cf-connecting-ip"));
  if (cf) return cf;

  const xff = getHeader("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    const fromXff = normalizeClientIpCandidate(first);
    if (fromXff) return fromXff;
  }

  return normalizeClientIpCandidate(getHeader("x-real-ip"));
}

export function resolveRateLimitIdentity(
  trustProxy: boolean,
  clientIp: string | undefined,
  getHeader: (name: string) => string | undefined,
): RateLimitIdentity {
  let ip: string | undefined = trustProxy ? parseClientIpFromProxyHeaders(getHeader) : undefined;
  if (!ip) {
    ip = normalizeClientIpCandidate(clientIp);
  }
  if (ip) return { type: "ip", value: ip };

  const sessionId = getHeader(HEADER_KEYS.SESSION_ID)?.trim();
  if (sessionId) return { type: "session", value: sessionId };

  return { type: "unknown" };
}

export function rateLimitKeyFromIdentity(id: RateLimitIdentity): string {
  switch (id.type) {
    case "ip":
      return `ip:${id.value}`;
    case "session":
      return `session:${id.value}`;
    default:
      return "unknown-client";
  }
}
