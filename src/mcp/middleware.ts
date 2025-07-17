/**
 * @description Validation middleware for MCP tools with consistent error handling
 * @module
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createErrorMap, fromError } from "zod-validation-error/v4";
import { z } from "zod/v4";

z.config({
  customError: createErrorMap({
    includePath: true,
  }),
});

/**
 * Middleware to validate arguments against a Zod schema
 * @template T - The type of the validated arguments
 * @param schema - The Zod schema to validate against
 * @returns A function that validates arguments
 */
export function createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return (args: unknown): T => {
    try {
      return schema.parse(args);
    } catch (error) {
      const validationError = fromError(error);
      throw validationError;
    }
  };
}

/**
 * Middleware to safely call a tool with validation and error handling
 * @template T - The type of the validated arguments
 * @template R - The type of the result
 */
export function safeToolCall<T, R>(
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
      if (error instanceof z.ZodError) {
        const validationError = fromError(error);
        return {
          content: [{
            type: "text",
            text: validationError.message,
          }],
          isError: true,
          structuredContent: {
            error: validationError,
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
