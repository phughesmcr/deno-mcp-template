import { createArrayValidator } from "$/shared/utils.ts";
import { isValidHostname } from "./hostname.ts";

function stripOptionalPort(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith("[")) {
    const match = trimmed.match(/^(\[[^\]]+\])(?::\d+)?$/);
    return match?.[1] ?? trimmed;
  }

  // Preserve IPv6 literals (e.g. 2001:db8::1) as-is.
  if (isValidHostname(trimmed)) {
    return trimmed;
  }

  const separatorIndex = trimmed.lastIndexOf(":");
  if (separatorIndex === -1) {
    return trimmed;
  }

  const hostPart = trimmed.slice(0, separatorIndex);
  const portPart = trimmed.slice(separatorIndex + 1);
  if (!hostPart || !/^\d+$/.test(portPart)) {
    return trimmed;
  }

  return hostPart;
}

const validateHost = (host: string): string => {
  let trimmedHost = host.trim().toLowerCase();

  // Handle wildcard
  if (trimmedHost === "*") return trimmedHost;

  // Strip protocol if present (user might confuse --host with --origin)
  if (trimmedHost.startsWith("http://") || trimmedHost.startsWith("https://")) {
    try {
      trimmedHost = new URL(trimmedHost).hostname.toLowerCase();
    } catch {
      throw new Error(
        `Invalid host: ${host}. Must be a valid hostname, IP address, localhost, or *. Note: Use --origin for full URLs.`,
      );
    }
  }

  trimmedHost = stripOptionalPort(trimmedHost).toLowerCase();

  if (!trimmedHost || !isValidHostname(trimmedHost)) {
    throw new Error(
      `Invalid host: ${host}. Must be a valid hostname, IP address, localhost, or *. Note: Use --origin for full URLs.`,
    );
  }
  return trimmedHost;
};

export const validateHosts = createArrayValidator(validateHost);
