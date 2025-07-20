import { createArrayValidator } from "$/shared/utils.ts";
import { isValidHostname } from "./hostname.ts";

const validateHost = (host: string): string => {
  let trimmedHost = host.trim().toLowerCase();

  // Handle wildcard
  if (trimmedHost === "*") return trimmedHost;

  // Strip protocol if present (user might confuse --host with --origin)
  if (trimmedHost.startsWith("http://") || trimmedHost.startsWith("https://")) {
    const withoutProtocol = trimmedHost.replace(/^https?:\/\//, "");
    const withoutPort = withoutProtocol.split(":")[0];
    if (withoutPort) {
      trimmedHost = withoutPort;
    }
  }

  // Strip port if present
  if (trimmedHost.includes(":") && !trimmedHost.startsWith("[")) {
    trimmedHost = trimmedHost.split(":")[0]!;
  }

  if (!trimmedHost || !isValidHostname(trimmedHost)) {
    throw new Error(
      `Invalid host: ${host}. Must be a valid hostname, IP address, localhost, or *. Note: Use --origin for full URLs.`,
    );
  }
  return trimmedHost;
};

export const validateHosts = createArrayValidator(validateHost);
