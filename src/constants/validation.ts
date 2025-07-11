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

export const VALID_LOG_LEVELS = Object.keys(LOG_LEVEL) as (keyof typeof LOG_LEVEL)[];
