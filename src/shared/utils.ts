/**
 * @description Shared utility functions for the MCP server
 * @module
 */

import {
  type CallToolResult,
  JSONRPC_VERSION,
  type JSONRPCError,
  type RequestId,
} from "@modelcontextprotocol/sdk/types.js";

export interface RPCErrorSpec {
  code: number;
  message: string;
  requestId: RequestId;
  data?: unknown;
  options?: ErrorOptions;
}

/** Custom RPC Error class with structured data and JSON-RPC 2.0 compliance */
export class RPCError extends Error {
  readonly code: number;
  readonly requestId: RequestId;
  readonly data?: unknown;
  readonly timestamp: string;

  constructor(spec: RPCErrorSpec) {
    super(spec.message, spec.options);
    this.name = "RPCError";
    this.code = spec.code;
    this.requestId = spec.requestId;
    this.data = spec.data;
    this.timestamp = new Date().toISOString();

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, RPCError.prototype);
  }

  /** Convert to JSON-RPC 2.0 error response format */
  toJSONRPC(): JSONRPCError {
    const errorData = this.data ?
      {
        ...this.data,
        timestamp: this.timestamp,
        errorCode: this.code,
      } :
      {
        timestamp: this.timestamp,
        errorCode: this.code,
      };

    return {
      jsonrpc: JSONRPC_VERSION,
      id: this.requestId,
      error: {
        code: this.code,
        message: this.message,
        data: errorData,
      },
    };
  }

  /** Convert to JSON string representation */
  override toString(): string {
    return JSON.stringify(this.toJSONRPC());
  }

  /** Create error response with additional context */
  withContext(additionalData: Record<string, unknown>): RPCError {
    const mergedData = this.data ? { ...this.data, ...additionalData } : additionalData;
    return new RPCError({
      code: this.code,
      message: this.message,
      requestId: this.requestId,
      data: mergedData,
    });
  }

  /** Static factory methods for common RPC errors */
  static internalError(requestId: RequestId, data?: unknown): RPCError {
    return new RPCError({
      code: -32603,
      message: "Internal error",
      requestId,
      data,
    });
  }

  /** Create from standard Error with additional context */
  static fromError(
    error: Error,
    code: number,
    requestId: RequestId,
    additionalData?: unknown,
  ): RPCError {
    const data = {
      originalError: error.message,
      errorType: error.constructor.name,
      stack: error.stack,
      ...(additionalData as Record<string, unknown> || {}),
    };

    return new RPCError({
      code,
      message: error.message,
      requestId,
      data,
      options: { cause: error },
    });
  }
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
  if (firstRejected) {
    return firstRejected.reason instanceof Error ?
      firstRejected.reason :
      new Error(String(firstRejected.reason));
  }
  return null;
}
