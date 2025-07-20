import { DEFAULT_LOG_LEVEL, VALID_LOG_LEVELS } from "$/shared/constants.ts";
import type { LogLevelKey } from "$/shared/types.ts";

export function validateLogLevel(logLevel: string): LogLevelKey {
  const normalized = logLevel.trim().toLowerCase();
  if (!normalized) return DEFAULT_LOG_LEVEL;
  if (!VALID_LOG_LEVELS.includes(normalized as LogLevelKey)) {
    throw new Error(
      `Invalid log level: ${normalized}. Must be one of: ${VALID_LOG_LEVELS.join(", ")}.`,
    );
  }
  return normalized as LogLevelKey;
}
