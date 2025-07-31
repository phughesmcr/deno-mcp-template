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
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
    };
  }
}
