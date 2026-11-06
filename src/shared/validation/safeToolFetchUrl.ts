/**
 * Server-side fetch helpers for MCP tools (SSRF mitigation).
 *
 * **DNS / resolution caveat:** {@link isUrlAllowedForServerSideFetch} inspects the request URL
 * string (host literals, blocked IP ranges, suffix rules). It does **not** validate addresses after
 * DNS resolution. Hostnames that resolve to private or changing targets can still be a risk in
 * hostile environments. For stricter deployments, use an egress proxy, resolver/egress policy,
 * disable outbound tools, or add resolved-address checks when your runtime supports them.
 *
 * @module
 */

/** Error thrown when a URL is rejected by server-side fetch policy (SSRF mitigation). */
export class DisallowedFetchUrlError extends Error {
  override readonly name = "DisallowedFetchUrlError";
  constructor(message = "URL not allowed") {
    super(message);
    Object.setPrototypeOf(this, DisallowedFetchUrlError.prototype);
  }
}

export type SafeToolFetchUrlOptions = {
  /** When false, only `https:` URLs are allowed. */
  allowHttp: boolean;
};

const BLOCKED_EXACT_HOSTS = new Set(
  [
    "localhost",
    "0.0.0.0",
    "metadata.google.internal",
  ].map((h) => h.toLowerCase()),
);

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal"];

function parseIpv4Octets(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].map((x) => Number(x));
  if (parts.some((n) => n < 0 || n > 255)) return null;
  return parts as [number, number, number, number];
}

function isBlockedIpv4(octets: [number, number, number, number]): boolean {
  const [a, b, c] = octets;
  if (a === 0 || a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return a >= 224; // Multicast, reserved and broadcast.
}

/** Expands a hostname from `URL`, which is always hex with no zone, into its eight groups. */
function parseIpv6Groups(host: string): number[] | null {
  const [head = "", tail, ...rest] = host.split("::");
  if (rest.length > 0) return null;
  const parse = (part: string) => part ? part.split(":").map((x) => parseInt(x, 16)) : [];
  const left = parse(head);
  const right = parse(tail ?? "");
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return null;
  const groups = [...left, ...new Array<number>(missing).fill(0), ...right];
  return groups.every((n) => n >= 0 && n <= 0xffff) ? groups : null;
}

function toOctets(high: number, low: number): [number, number, number, number] {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

/** Returns the IPv4 address an IPv6 address carries, however it is embedded. */
function embeddedIpv4(groups: number[]): [number, number, number, number] | null {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = groups;
  if (a === 0x2002) return toOctets(b, c); // 6to4
  const isNat64 = a === 0x64 && b === 0xff9b && !c && !d && !e && !f;
  const isZeroPrefix = !a && !b && !c && !d;
  const isCompatible = isZeroPrefix && !e && !f; // Includes :: and ::1.
  const isMapped = isZeroPrefix && !e && f === 0xffff;
  const isTranslated = isZeroPrefix && e === 0xffff && !f;
  return isNat64 || isCompatible || isMapped || isTranslated ? toOctets(g, h) : null;
}

function isBlockedIpv6Hostname(hostname: string): boolean {
  const groups = parseIpv6Groups(hostname);
  if (!groups) return true;

  const ipv4 = embeddedIpv4(groups);
  if (ipv4) return isBlockedIpv4(ipv4);

  // Only 2000::/3 is global unicast, less Teredo (2001::/32) and documentation (2001:db8::/32).
  const [first = 0, second = 0] = groups;
  if ((first & 0xe000) !== 0x2000) return true;
  return first === 0x2001 && (second === 0 || second === 0xdb8);
}

/**
 * Returns true when the URL's origin is allowed for the `fetch-website-info` tool
 * (blocks private/link-local/metadata targets; optional HTTP).
 *
 * This is **not** a guarantee against DNS rebinding or post-resolution private targets; see module
 * doc.
 */
export function isUrlAllowedForServerSideFetch(
  url: URL,
  options: SafeToolFetchUrlOptions,
): boolean {
  if (options.allowHttp) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  } else if (url.protocol !== "https:") {
    return false;
  }

  let hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }
  if (!hostname) return false;

  if (BLOCKED_EXACT_HOSTS.has(hostname)) return false;
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (hostname.endsWith(suffix)) return false;
  }

  const ipv4 = parseIpv4Octets(hostname);
  if (ipv4) return !isBlockedIpv4(ipv4);

  if (hostname.includes(":")) {
    return !isBlockedIpv6Hostname(hostname);
  }

  return true;
}

export function assertUrlAllowedForServerSideFetch(
  url: URL,
  options: SafeToolFetchUrlOptions,
): void {
  if (!isUrlAllowedForServerSideFetch(url, options)) {
    throw new DisallowedFetchUrlError();
  }
}

const MAX_REDIRECTS = 5;

function readAllowHttpFromEnv(): boolean {
  const v = Deno.env.get("MCP_DOMAIN_TOOL_ALLOW_HTTP")?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export type SafeHeadWithRedirectsResult = {
  response: Response;
  /** True when at least one 3xx hop was followed to a validated next URL. */
  redirected: boolean;
};

export type HeadUrlWithSafeRedirectsDeps = {
  /** Injected for tests; defaults to global `fetch`. */
  fetch?: typeof fetch;
};

/**
 * Performs HEAD with `redirect: manual`, validating each hop.
 *
 * `Response.redirected` is unreliable with `redirect: "manual"`; use {@link SafeHeadWithRedirectsResult.redirected}.
 */
export async function headUrlWithSafeRedirects(
  initialUrl: string,
  signal: AbortSignal,
  deps?: HeadUrlWithSafeRedirectsDeps,
): Promise<SafeHeadWithRedirectsResult> {
  const doFetch = deps?.fetch ?? fetch;
  const options: SafeToolFetchUrlOptions = { allowHttp: readAllowHttpFromEnv() };
  let current: URL;
  try {
    current = new URL(initialUrl);
  } catch {
    throw new DisallowedFetchUrlError();
  }
  assertUrlAllowedForServerSideFetch(current, options);
  let redirected = false;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await doFetch(current.toString(), {
      method: "HEAD",
      redirect: "manual",
      signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("location");
      if (!loc) {
        return { response, redirected };
      }
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new DisallowedFetchUrlError();
      }
      assertUrlAllowedForServerSideFetch(next, options);
      current = next;
      redirected = true;
      continue;
    }

    return { response, redirected };
  }

  throw new DisallowedFetchUrlError("Too many redirects");
}
