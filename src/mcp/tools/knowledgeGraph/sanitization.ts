/**
 * @description Input sanitization utilities for knowledge graph data
 * @module
 */

import { isAbsolute, normalize } from "@std/path";

export class InputSanitizer {
  /**
   * Sanitizes entity names to prevent XSS and injection attacks
   */
  static sanitizeEntityName(name: string): string {
    return name
      .trim()
      .replace(/[<>\"'&]/g, "") // Remove HTML/script characters
      // deno-lint-ignore no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, "") // Remove control characters
      .substring(0, 255); // Limit length
  }

  /**
   * Sanitizes observation content while preserving readability
   */
  static sanitizeObservation(content: string): string {
    return content
      .trim()
      // deno-lint-ignore no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove most control chars but keep \n, \r, \t
      .substring(0, 1000); // Limit length
  }

  /**
   * Validates and normalizes file paths to prevent traversal attacks
   */
  static validateFilePath(path: string): string {
    const normalized = normalize(path.trim());

    if (normalized.includes("..")) {
      throw new Error("Path traversal not allowed");
    }

    if (
      !isAbsolute(normalized) && !normalized.startsWith("./") &&
      !normalized.match(/^[a-zA-Z0-9_\-\/\.]+$/)
    ) {
      throw new Error("Invalid file path format");
    }

    return normalized;
  }

  /**
   * Sanitizes search queries to prevent injection attacks
   */
  static sanitizeSearchQuery(query: string): string {
    return query
      .trim()
      .replace(/[<>\"'&]/g, "")
      // deno-lint-ignore no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, "")
      .substring(0, 500);
  }
}
