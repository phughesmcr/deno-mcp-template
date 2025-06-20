/**
 * @description Shared utility functions for the MCP server
 * @module
 */

import {
  JSONRPC_VERSION,
  type JSONRPCError,
  type JSONRPCResponse,
  type RequestId,
  type Result,
} from "@vendor/schema";

/** Creates a JSON-RPC error response */
export function createRPCError(id: RequestId, code: number, message: string): JSONRPCError {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { code, message },
  };
}

/** Creates a JSON-RPC success response */
export function createRPCSuccess(id: RequestId, result: Result): JSONRPCResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}
