/**
 * @description Shared utility functions for the MCP server
 * @module
 */

import { DEFAULT_LOG_LEVEL, VALID_LOG_LEVELS } from "$/constants";
import {
  type CallToolResult,
  JSONRPC_VERSION,
  type JSONRPCError,
  type JSONRPCResponse,
  type RequestId,
  type Result,
} from "@modelcontextprotocol/sdk/types.js";
import type { LogLevelKey } from "./types.ts";

/** Creates a JSON-RPC error response */
export function createRPCError(
  id: RequestId,
  code: number,
  message: string,
  data?: unknown,
): JSONRPCError {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { code, message, data },
  };
}

/** Creates a JSON-RPC success response */
export function createRPCSuccess(
  id: RequestId,
  result: Result,
): JSONRPCResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

function isValidHostnameLabel(label: string): boolean {
  // Label length must be between 1 and 63 characters
  if (label.length === 0 || label.length > 63) return false;

  // Cannot start or end with hyphen
  if (label.startsWith("-") || label.endsWith("-")) return false;

  // Only alphanumeric characters and hyphens allowed
  const validPattern = /^[a-zA-Z0-9-]+$/;
  return validPattern.test(label);
}

function isValidIPv4(ip: string): boolean {
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Pattern);

  if (!match) return false;

  // Check each octet is between 0-255
  for (let i = 1; i <= 4; i++) {
    const octetStr = match[i];
    if (!octetStr) {
      return false;
    }

    const octet = parseInt(octetStr, 10);
    if (octet < 0 || octet > 255) {
      return false;
    }
    // Check for leading zeros (except for "0")
    if (octetStr.length > 1 && octetStr.startsWith("0")) {
      return false;
    }
  }

  return true;
}

function isValidIPv6(ip: string): boolean {
  // Remove brackets if present
  const cleanIp = ip.replace(/^\[|\]$/g, "");

  // Basic IPv6 pattern - simplified but covers most cases
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  const ipv6CompressedPattern = /^([0-9a-fA-F]{0,4}:)*::([0-9a-fA-F]{0,4}:)*[0-9a-fA-F]{0,4}$/;
  const ipv6FullPattern = /^([0-9a-fA-F]{4}:){7}[0-9a-fA-F]{4}$/;

  // Check for various IPv6 formats
  if (cleanIp === "::") return true; // All zeros

  return ipv6FullPattern.test(cleanIp) ||
    ipv6CompressedPattern.test(cleanIp) ||
    ipv6Pattern.test(cleanIp);
}

export function isValidHostname(hostname: string): boolean {
  // Check for IPv4 address
  if (isValidIPv4(hostname)) return true;

  // Check for IPv6 address (with or without brackets)
  if (isValidIPv6(hostname)) return true;

  // Check basic constraints
  if (hostname.length === 0 || hostname.length > 253) return false;

  // Cannot start or end with dots
  if (hostname.startsWith(".") || hostname.endsWith(".")) return false;

  // Split into labels and validate each
  const labels = hostname.split(".");
  for (const label of labels) {
    if (!isValidHostnameLabel(label)) {
      return false;
    }
  }

  return true;
}

/**
 * Generic validation helper that throws with a descriptive error message
 */
function createValidator<T>(
  predicate: (value: T) => boolean,
  errorMessage: (value: T) => string,
) {
  return (value: T): T => {
    if (!predicate(value)) {
      throw new Error(errorMessage(value));
    }
    return value;
  };
}

export const validateHostname = createValidator(
  isValidHostname,
  (hostname) => `Invalid hostname: ${hostname}. Must be a valid hostname or IP address.`,
);

export const validatePort = createValidator(
  (port: number) => Number.isInteger(port) && port >= 1 && port <= 65535,
  (port) => `Invalid port: ${port}. Must be between 1 and 65535.`,
);

export function validateLogLevel(logLevel: string): string {
  const normalized = logLevel.trim().toLowerCase();
  if (!normalized) return DEFAULT_LOG_LEVEL;
  if (!VALID_LOG_LEVELS.includes(normalized as LogLevelKey)) {
    throw new Error(
      `Invalid log level: ${normalized}. Must be one of: ${VALID_LOG_LEVELS.join(", ")}.`,
    );
  }
  return normalized;
}

/**
 * Generic array validator with item-by-item validation
 */
function createArrayValidator<T>(
  itemValidator: (item: T) => T,
) {
  return (items: T[]): T[] => items.map(itemValidator);
}

const validateHeader = (header: string): string => {
  // RFC 7230 compliant header name pattern: letters, numbers, hyphens, underscores
  const headerNamePattern = /^[a-zA-Z0-9_-]+$/;
  // Header value pattern: printable ASCII characters (excluding control chars)
  const headerValuePattern = /^[\x20-\x7E]*$/;

  const colonIndex = header.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(`Invalid header: ${header}. Must be in the format "key:value".`);
  }

  const key = header.substring(0, colonIndex).trim();
  const value = header.substring(colonIndex + 1).trim();

  if (!key || !headerNamePattern.test(key)) {
    throw new Error(
      `Invalid header name: ${key}. Must contain only letters, numbers, hyphens, and underscores.`,
    );
  }

  if (!headerValuePattern.test(value)) {
    throw new Error(
      `Invalid header value: ${value}. Must contain only printable ASCII characters.`,
    );
  }

  return `${key}:${value}`;
};

const validateOrigin = (origin: string): string => {
  // Regex to validate server origins (protocol://hostname:port)
  const pattern =
    /^(?:\*|(?:https?:\/\/)?(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?|localhost|(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))(?::[1-9][0-9]{0,4})?)$/;

  const trimmedOrigin = origin.trim();

  // Allow wildcard
  if (trimmedOrigin === "*") return trimmedOrigin;

  // If no protocol, assume http://
  const originWithProtocol =
    trimmedOrigin.startsWith("http://") || trimmedOrigin.startsWith("https://") ?
      trimmedOrigin :
      `http://${trimmedOrigin}`;

  if (pattern.test(originWithProtocol)) return trimmedOrigin;

  throw new Error(
    `Invalid origin: ${origin}. Must be a valid origin (e.g., https://example.com, http://localhost:3000, or *).`,
  );
};

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

export const validateHeaders = createArrayValidator(validateHeader);
export const validateOrigins = createArrayValidator(validateOrigin);
export const validateHosts = createArrayValidator(validateHost);

export const createCallToolTextResponse = (
  obj: unknown,
  structuredContent?: Record<string, unknown>,
): CallToolResult => {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(obj),
      },
    ],
    structuredContent,
  };
};

export function createCallToolErrorResponse(
  obj: unknown,
  structuredContent?: Record<string, unknown>,
): CallToolResult {
  return {
    isError: true,
    ...createCallToolTextResponse(obj, structuredContent),
  };
}
