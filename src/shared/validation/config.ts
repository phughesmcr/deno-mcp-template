import type { CliOptions } from "$/app/cli.ts";
import type { AppConfig, HttpServerConfig, StdioConfig } from "$/shared/types.ts";
import {
  validateHeaders,
  validateHostname,
  validateHosts,
  validateOrigins,
  validatePort,
} from "$/shared/validation.ts";

const UUID_V4_REGEX = new RegExp(
  /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i,
);

/**
 * Checks if a string is a valid UUID v4
 * @param str - The string to validate
 * @returns True if the string is a valid UUID v4
 */
export function isUUID(str: string): boolean {
  return UUID_V4_REGEX.test(str);
}

export type ValidationResult<T, E extends Error = Error> = {
  success: true;
  value: T;
} | {
  success: false;
  error: E;
};

/**
 * Validates HTTP server configuration from CLI options
 * @param config - The CLI options to validate
 * @returns The validation result with HTTP server config or error
 */
export function validateHttpConfig(config: CliOptions): ValidationResult<HttpServerConfig> {
  const {
    http,
    hostname,
    port,
    headers,
    allowedHosts,
    allowedOrigins,
    dnsRebinding,
    jsonResponse,
  } = config;
  try {
    const validatedHostname = validateHostname(hostname);
    const validatedPort = validatePort(port);
    const validatedHeaders = validateHeaders(headers);
    const validatedAllowedHosts = validateHosts(allowedHosts);
    const validatedAllowedOrigins = validateOrigins(allowedOrigins);
    return {
      success: true,
      value: {
        enabled: !!http,
        hostname: validatedHostname,
        port: validatedPort,
        headers: validatedHeaders,
        allowedHosts: validatedAllowedHosts,
        allowedOrigins: validatedAllowedOrigins,
        enableDnsRebinding: !!dnsRebinding,
        jsonResponseMode: !!jsonResponse,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
    };
  }
}

/**
 * Validates STDIO configuration from CLI options
 * @param config - The CLI options to validate
 * @returns The validation result with STDIO config or error
 */
export function validateStdioConfig(config: CliOptions): ValidationResult<StdioConfig> {
  const { stdio } = config;
  return {
    success: true,
    value: {
      enabled: !!stdio,
    },
  };
}

/**
 * Validates the complete application configuration from CLI options
 * @param config - The CLI options to validate
 * @returns The validation result with app config or error
 */
export function validateConfig(config: CliOptions): ValidationResult<AppConfig> {
  try {
    const validatedHttp = validateHttpConfig(config);
    if (!validatedHttp.success) throw validatedHttp.error;

    const validatedStdio = validateStdioConfig(config);
    if (!validatedStdio.success) throw validatedStdio.error;

    if (!config.stdio && !config.http) {
      throw new Error(
        "Both the HTTP and STDIO servers are disabled. Please enable at least one server.",
      );
    }

    return {
      success: true,
      value: {
        ...config,
        http: { ...validatedHttp.value },
        stdio: { ...validatedStdio.value },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
    };
  }
}
