/**
 * @description Shared utility functions for the MCP server
 * @module
 */

import type { CallToolResult } from "@modelcontextprotocol/server";

/**
 * Generic validation helper that throws with a descriptive error message
 */
export function createValidator<T>(
  predicate: (value: T) => boolean,
  errorMessage: (value: T) => string,
): (value: T) => T {
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
): (items: T[]) => T[] {
  return (items: T[]): T[] => items.map(itemValidator);
}

export function createCallToolTextResponse(
  obj: unknown,
  structuredContent?: Record<string, unknown>,
): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(obj),
      },
    ],
    structuredContent,
  };
}

export function createCallToolErrorResponse(
  obj: unknown,
  structuredContent?: Record<string, unknown>,
): CallToolResult {
  return {
    isError: true,
    ...createCallToolTextResponse(obj, structuredContent),
  };
}

export function getRejected(results: PromiseSettledResult<unknown>[]): Error | null {
  const firstRejected = results.find((r) => r.status === "rejected") as
    | PromiseRejectedResult
    | undefined;
  if (!firstRejected) return null;
  const { reason } = firstRejected;
  if (reason instanceof Error) return reason;
  return new Error(String(reason));
}
