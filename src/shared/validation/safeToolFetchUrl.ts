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
  const [a, b] = octets;
  if (a === 0 || a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedIpv6Hostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "::1") return true;

  const v4mapped = /::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(h);
  if (v4mapped) {
    const parsed = parseIpv4Octets(v4mapped[1] ?? "");
    if (parsed && isBlockedIpv4(parsed)) return true;
  }

  const first = h.split(":")[0] ?? "";
  if (first.startsWith("ff")) return true;
  if (first.startsWith("fc") || first.startsWith("fd")) return true;
  if (
    first.startsWith("fe8") || first.startsWith("fe9") || first.startsWith("fea") ||
    first.startsWith("feb")
  ) {
    return true;
  }
  return false;
}

/**
 * Returns true when the URL's origin is allowed for the `fetch-website-info` tool
 * (blocks private/link-local/metadata targets; optional HTTP).
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

  let hostname = url.hostname.toLowerCase();
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

/**
 * Performs HEAD with `redirect: manual`, validating each hop.
 */
export async function headUrlWithSafeRedirects(
  initialUrl: string,
  signal: AbortSignal,
): Promise<Response> {
  const options: SafeToolFetchUrlOptions = { allowHttp: readAllowHttpFromEnv() };
  let current: URL;
  try {
    current = new URL(initialUrl);
  } catch {
    throw new DisallowedFetchUrlError();
  }
  assertUrlAllowedForServerSideFetch(current, options);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current.toString(), {
      method: "HEAD",
      redirect: "manual",
      signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("location");
      if (!loc) {
        return response;
      }
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new DisallowedFetchUrlError();
      }
      assertUrlAllowedForServerSideFetch(next, options);
      current = next;
      continue;
    }

    return response;
  }

  throw new DisallowedFetchUrlError("Too many redirects");
}
