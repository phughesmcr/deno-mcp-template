import type { CliOptions } from "$/app/cli.ts";
import type { AppConfig, HttpServerConfig, LoggerConfig, StdioConfig } from "$/shared/types.ts";
import {
  validateHeaders,
  validateHostname,
  validateHosts,
  validateLogLevel,
  validateOrigins,
  validatePort,
} from "$/shared/validation.ts";

export type ValidationResult<T, E extends Error = Error> = {
  success: true;
  value: T;
} | {
  success: false;
  error: E;
};

export function validateHttpConfig(config: CliOptions): ValidationResult<HttpServerConfig> {
  const { http, hostname, port, headers, allowedHosts, allowedOrigins, dnsRebinding } = config;
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
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
    };
  }
}

export function validateStdioConfig(config: CliOptions): ValidationResult<StdioConfig> {
  const { stdio } = config;
  return {
    success: true,
    value: {
      enabled: !!stdio,
    },
  };
}

export function validateLoggerConfig(config: CliOptions): ValidationResult<LoggerConfig> {
  const { logLevel } = config;
  try {
    const validatedLogLevel = validateLogLevel(logLevel);
    return {
      success: true,
      value: {
        level: validatedLogLevel,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
    };
  }
}

export function validateConfig(config: CliOptions): ValidationResult<AppConfig> {
  try {
    const validatedHttp = validateHttpConfig(config);
    if (!validatedHttp.success) throw validatedHttp.error;

    const validatedStdio = validateStdioConfig(config);
    if (!validatedStdio.success) throw validatedStdio.error;

    const validatedLogger = validateLoggerConfig(config);
    if (!validatedLogger.success) throw validatedLogger.error;

    return {
      success: true,
      value: {
        http: {
          enabled: !!config.http,
          hostname: config.hostname,
          port: config.port,
          headers: config.headers,
          allowedHosts: config.allowedHosts,
          allowedOrigins: config.allowedOrigins,
          enableDnsRebinding: config.dnsRebinding,
        },
        stdio: {
          enabled: !!config.stdio,
        },
        log: {
          level: config.logLevel,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
    };
  }
}
