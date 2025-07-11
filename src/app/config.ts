/**
 * @description Configuration management and validation for the app
 * @module
 */

import { parseArgs } from "@std/cli";

import {
  ALLOWED_HOSTS,
  ALLOWED_ORIGINS,
  APP_NAME,
  APP_VERSION,
  CLI_ARGS,
  DEFAULT_HOSTNAME,
  DEFAULT_LOG_LEVEL,
  DEFAULT_PORT,
  ENV_VARS,
  HEADERS,
  helpText,
} from "$/constants";
import type { AppConfig, LogLevelKey } from "../types.ts";
import {
  validateHeaders,
  validateHostname,
  validateHosts,
  validateLogLevel,
  validateOrigins,
  validatePort,
} from "../utils.ts";

function showVersion(): void {
  console.error(`${APP_NAME} v${APP_VERSION}`);
}

function showHelp(): void {
  showVersion();
  console.error(helpText);
}

/**
 * Generic configuration parser that handles CLI args, env vars, and defaults
 */
function parseConfigValue<T>(
  cliValue: T | undefined,
  envVar: string,
  defaultValue: T,
  transformer?: (value: unknown) => T,
): T {
  const envValue = Deno.env.get(envVar);
  const rawValue = cliValue ?? envValue ?? defaultValue;
  if (transformer && rawValue !== defaultValue) {
    return transformer(rawValue);
  }
  return rawValue as T;
}

/**
 * Array-specific configuration parser with comma-separated env var support
 */
function parseArrayConfig(
  cliValues: string[] | undefined,
  envVar: string,
  defaultValue: string[],
  validator?: (value: string[]) => string[],
): string[] {
  const envValue = Deno.env.get(envVar);
  const cli = (cliValues || []).map((v) => v.trim()).filter((v) => v !== "");
  const env = (envValue ? envValue.split(",").map((v) => v.trim()) : []).filter((v) => v !== "");
  const combined = [...new Set([...cli, ...env])];
  const result = combined.length > 0 ? combined : defaultValue;
  return validator ? validator(result) : result;
}

/**
 * Validates and returns the application configuration
 * @note CLI flags take precedence over environment variables
 * @returns The validated configuration
 */
export function parseConfig(): AppConfig {
  const args = parseArgs(Deno.args, CLI_ARGS);

  if (args.help) {
    showHelp();
    Deno.exit(0);
  }

  if (args.version) {
    showVersion();
    Deno.exit(0);
  }

  const res = {
    allowedOrigins: parseArrayConfig(
      args.origin,
      ENV_VARS.ALLOWED_ORIGINS,
      ALLOWED_ORIGINS,
      validateOrigins,
    ),
    allowedHosts: parseArrayConfig(
      args.host,
      ENV_VARS.ALLOWED_HOSTS,
      ALLOWED_HOSTS,
      validateHosts,
    ),
    headers: parseArrayConfig(
      args.header,
      ENV_VARS.HEADERS,
      HEADERS,
      validateHeaders,
    ),
    hostname: parseConfigValue(
      args.hostname,
      ENV_VARS.HOSTNAME,
      DEFAULT_HOSTNAME,
      (value) => validateHostname(String(value)),
    ),
    log: parseConfigValue(
      args.log,
      ENV_VARS.LOG,
      DEFAULT_LOG_LEVEL,
      (value) => validateLogLevel(String(value)),
    ) as LogLevelKey,
    noHttp: parseConfigValue(
      args["no-http"],
      ENV_VARS.NO_HTTP,
      false,
      (value) => Boolean(value),
    ),
    noStdio: parseConfigValue(
      args["no-stdio"],
      ENV_VARS.NO_STDIO,
      false,
      (value) => Boolean(value),
    ),
    port: parseConfigValue(
      args.port ? Number(args.port) : undefined,
      ENV_VARS.PORT,
      DEFAULT_PORT,
      (value) => {
        const parsed = typeof value === "string" ? parseInt(value, 10) : Number(value);
        if (isNaN(parsed)) {
          throw new Error(`Must be a number, got: ${value}`);
        }
        return validatePort(parsed);
      },
    ),
  };

  // Setup allowed hosts and origins for MCP DNS rebinding protection
  const allowedHosts = [
    ...new Set([
      ...ALLOWED_HOSTS,
      res.hostname,
      `${res.hostname}:${res.port}`,
    ]),
  ];

  const allowedOrigins = [
    ...new Set([
      ...ALLOWED_ORIGINS,
      res.hostname,
      `${res.hostname}:${res.port}`,
      `http://${res.hostname}`,
      `https://${res.hostname}`,
      `http://${res.hostname}:${res.port}`,
      `https://${res.hostname}:${res.port}`,
    ]),
  ];

  return {
    ...res,
    allowedHosts,
    allowedOrigins,
  };
}
