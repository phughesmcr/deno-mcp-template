/**
 * Pure policy for streamable HTTP MCP session acquisition (initialize vs existing session).
 * @module
 */

import { RPC_ERROR_CODES } from "$/shared/constants.ts";

export type McpStreamableAcquireInput = {
  sessionId: string | undefined;
  parsedBody: unknown;
};

export type McpStreamableAcquirePlan = { kind: "create_session"; parsedBody: unknown };

export type McpStreamableAcquireFailure = {
  code: number;
  message: string;
};

export type McpStreamableAcquireResult =
  | { ok: true; plan: McpStreamableAcquirePlan }
  | { ok: false; error: McpStreamableAcquireFailure };

/**
 * Call only when registry lookup for `sessionId` has already failed (or `sessionId` absent).
 */
export function planMcpStreamableAcquire(
  input: McpStreamableAcquireInput,
  isInitialize: (body: unknown) => boolean,
): McpStreamableAcquireResult {
  if (isInitialize(input.parsedBody)) {
    return { ok: true, plan: { kind: "create_session", parsedBody: input.parsedBody } };
  }
  if (!input.sessionId) {
    return {
      ok: false,
      error: {
        code: RPC_ERROR_CODES.INVALID_REQUEST,
        message: "No valid session ID provided",
      },
    };
  }
  return {
    ok: false,
    error: {
      code: RPC_ERROR_CODES.SESSION_NOT_FOUND,
      message: `No transport found for session ID: ${input.sessionId}`,
    },
  };
}

/**
 * Normalizes POST body text for MCP JSON-RPC (empty and parse errors in one place).
 */
export function parseMcpPostJsonBody(
  bodyText: string,
  requestId: string,
): { ok: true; parsed: unknown } | { ok: false; code: number; message: string } {
  void requestId;
  if (!bodyText.length) {
    return { ok: false, code: RPC_ERROR_CODES.INVALID_REQUEST, message: "Empty request body" };
  }
  try {
    return { ok: true, parsed: JSON.parse(bodyText) };
  } catch (error) {
    return {
      ok: false,
      code: RPC_ERROR_CODES.PARSE_ERROR,
      message: error instanceof Error ? error.message : "Invalid JSON in request body",
    };
  }
}
