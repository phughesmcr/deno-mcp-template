/**
 * @description Validation middleware for MCP tools with consistent error handling
 * @module
 */

import type { CallToolResult } from "@vendor/schema";
import { z } from "zod";

export class ValidationError extends Error {
  public readonly field: string;
  public readonly code: string;

  constructor(
    message: string,
    field: string,
    code: string = "VALIDATION_ERROR",
  ) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.code = code;
  }
}

export function createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return (args: unknown): T => {
    try {
      return schema.parse(args);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        throw new ValidationError(
          firstError?.message || "Validation failed",
          firstError?.path.join(".") || "unknown",
          firstError?.code || "VALIDATION_ERROR",
        );
      }
      throw error;
    }
  };
}

export function safeToolExecution<T, R>(
  validator: (args: unknown) => T,
  handler: (validatedArgs: T) => Promise<R>,
): (args: unknown) => Promise<CallToolResult> {
  return async (args: unknown): Promise<CallToolResult> => {
    try {
      const validatedArgs = validator(args);
      const result = await handler(validatedArgs);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
        structuredContent: { result },
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          content: [{
            type: "text",
            text: `Validation error in field '${error.field}': ${error.message}`,
          }],
          isError: true,
          structuredContent: {
            error: {
              type: "validation_error",
              field: error.field,
              message: error.message,
            },
          },
        };
      }

      return {
        content: [{
          type: "text",
          text: "An unexpected error occurred while processing your request",
        }],
        isError: true,
        structuredContent: {
          error: {
            type: "internal_error",
            message: "Internal processing error",
          },
        },
      };
    }
  };
}
