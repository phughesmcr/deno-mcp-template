/**
 * @description Validation related constants
 * @module
 */

/** MCP log levels (lower is more severe) */
export const LOG_LEVEL = {
  emergency: 0,
  alert: 1,
  critical: 2,
  error: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
} as const;

export const LOG_LEVEL_BY_SEVERITY = Object.fromEntries(
  Object.entries(LOG_LEVEL).map(([key, value]) => [value, key]),
) as Record<number, keyof typeof LOG_LEVEL>;

export const VALID_LOG_LEVELS = Object.keys(LOG_LEVEL) as (keyof typeof LOG_LEVEL)[];
