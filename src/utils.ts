import {
  JSONRPC_VERSION,
  type JSONRPCError,
  type JSONRPCMessage,
  type RequestId,
  type Result,
} from "../vendor/schema.ts";
import { HTTP_SUCCESS_CODE, SESSION_ID_HEADER } from "./constants.ts";

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
  return createJsonResponse(error, HTTP_SUCCESS_CODE);
}

export function createSuccessResponse(id: RequestId, result: unknown): Response {
  const response: JSONRPCMessage = {
    jsonrpc: JSONRPC_VERSION,
    id,
    result: result as Result,
  };
  return createJsonResponse(response, HTTP_SUCCESS_CODE);
}

// Get session ID from query parameter first (2024-11-05 standard approach)
// Fall back to header and body if not found in query
export async function getSessionId(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  const sessionIdFromQuery = url.searchParams.get("sessionId");
  let sessionId = sessionIdFromQuery;

  if (!sessionId) {
    try {
      const clone = req.clone();
      const data = await clone.json();
      sessionId = req.headers.get(SESSION_ID_HEADER) ??
        (data.id || data.sessionId || data[SESSION_ID_HEADER]);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  return sessionId;
}
