import type { JSONRPCError, JSONRPCMessage, RequestId, Result } from "../vendor/schema.ts";

export const textEncoder = new TextEncoder();

export function createErrorResponse(id: RequestId, code: number, message: string): Response {
  const error: JSONRPCError = {
    jsonrpc: "2.0",
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
    jsonrpc: "2.0",
    id,
    result: result as Result,
  };

  return new Response(
    JSON.stringify(response),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
