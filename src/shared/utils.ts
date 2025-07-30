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
} from "@modelcontextprotocol/sdk/types.js";

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

/**
 * Generic validation helper that throws with a descriptive error message
 */
export function createValidator<T>(
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

/**
 * Generic array validator with item-by-item validation
 */
export function createArrayValidator<T>(
  itemValidator: (item: T) => T,
) {
  return (items: T[]): T[] => items.map(itemValidator);
}

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

export function mergeArrays(a?: string[], b?: string[]): string[] {
  return [...new Set([...a ?? [], ...b ?? []])];
}
