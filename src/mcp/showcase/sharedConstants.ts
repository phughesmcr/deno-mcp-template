/**
 * Shared constants for showcase `test_*` tools/resources/prompts.
 * Keep isolated from `shared/constants/mcp.ts` to avoid import cycles.
 * @module
 */

/** 1x1 PNG (red pixel), base64. */
export const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAZCm6WQAAAABJRU5ErkJggg==";

export const TEST_EMBEDDED_RESOURCE_URI = "test://embedded-resource";
export const TEST_MIXED_CONTENT_RESOURCE_URI = "test://mixed-content-resource";
