import {
  JSONRPC_VERSION,
  type JSONRPCError,
  type JSONRPCMessage,
  type RequestId,
  type Result,
} from "../vendor/schema.ts";

export const textEncoder = new TextEncoder();

export function createJsonResponse(
  body: unknown,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...headers, "Content-Type": "application/json" } },
  );
}

export function createErrorResponse(id: RequestId, code: number, message: string): Response {
  const error: JSONRPCError = {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: {
      code,
      message,
    },
  };

  return new Response(
    JSON.stringify(error),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export function createSuccessResponse(id: RequestId, result: unknown): Response {
  const response: JSONRPCMessage = {
    jsonrpc: JSONRPC_VERSION,
    id,
    result: result as Result,
  };

  return new Response(
    JSON.stringify(response),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
