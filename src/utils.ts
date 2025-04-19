import type { JSONRPCError, JSONRPCMessage, RequestId, Result } from "../vendor/schema.ts";
import { HTTP, JSONRPC } from "./constants.ts";

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
    jsonrpc: JSONRPC.VERSION,
    id,
    error: {
      code,
      message,
    },
  };
  return createJsonResponse(error, HTTP.STATUS.SUCCESS);
}

export function createSuccessResponse(id: RequestId, result: unknown): Response {
  const response: JSONRPCMessage = {
    jsonrpc: JSONRPC.VERSION,
    id,
    result: result as Result,
  };
  return createJsonResponse(response, HTTP.STATUS.SUCCESS);
}
