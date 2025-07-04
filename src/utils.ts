/**
 * @description Shared utility functions for the MCP server
 * @module
 */

import {
  type CallToolResult,
  JSONRPC_VERSION,
  type JSONRPCError,
  type JSONRPCResponse,
  type RequestId,
  type Result,
} from "@vendor/schema";

/** Creates a JSON-RPC error response */
export function createRPCError(
  id: RequestId,
  code: number,
  message: string,
): JSONRPCError {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { code, message },
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

export const createCallToolTextResponse = (obj: unknown): CallToolResult => {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(obj, null, 2),
    }],
  };
};
