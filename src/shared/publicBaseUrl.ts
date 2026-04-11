/**
 * Resolves the public base URL for browser-facing links (e.g. URL-mode MCP elicitation).
 * Behind a reverse proxy, set `MCP_PUBLIC_BASE_URL` so links match what users open in a browser.
 * @module
 */

import type { HttpServerConfig } from "$/shared/config-types.ts";
import { isAllInterfacesBindHostname } from "$/shared/constants/http.ts";

/**
 * Normalizes a configured public base URL to `scheme://host[:port]` with no trailing slash.
 */
export function normalizePublicBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Public base URL cannot be empty.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Public base URL is not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Public base URL must use http: or https:.");
  }
  return parsed.origin;
}

/**
 * When HTTP is enabled: returns explicit `publicBaseUrl` if set, otherwise a dev default from bind address.
 * When HTTP is disabled: returns `undefined`.
 */
export function resolvePublicBaseUrl(http: HttpServerConfig): string | undefined {
  if (!http.enabled) return undefined;
  if (http.publicBaseUrl !== undefined && http.publicBaseUrl !== "") {
    return normalizePublicBaseUrl(http.publicBaseUrl);
  }
  const scheme = http.tlsCert && http.tlsKey ? "https" : "http";
  const host = isAllInterfacesBindHostname(http.hostname) ? "127.0.0.1" : http.hostname.trim();
  const needsBrackets = host.includes(":") && !host.startsWith("[");
  const hostPart = needsBrackets ? `[${host}]` : host;
  return `${scheme}://${hostPart}:${http.port}`;
}
