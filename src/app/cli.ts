/**
 * CLI configuration parser.
 *
 * This module is responsible for parsing the CLI arguments and environment variables
 * into an AppConfig object.
 *
 * @module
 */

import { parseArgs } from "@std/cli";

import {
  ALLOWED_HOSTS,
  ALLOWED_ORIGINS,
  APP_VERSION_STR,
  CLI_ARGS,
  DEFAULT_HOSTNAME,
  DEFAULT_LOG_LEVEL,
  DEFAULT_PORT,
  ENV_VARS,
  HEADERS,
  helpText,
} from "$/constants";
import type { AppConfig, LogLevelKey } from "$/types.ts";
import {
  validateHeaders,
  validateHostname,
  validateHosts,
  validateLogLevel,
  validateOrigins,
  validatePort,
} from "$/utils.ts";

interface ConfigValue<T> {
  cli?: T;
  env?: string;
  defaultValue?: T;
}

/** Generic configuration parser that handles CLI args, env vars, and defaults */
function parseConfigValue<T>(
  data: ConfigValue<T>,
  transformer?: (value: unknown) => T,
): T {
  const { cli, env, defaultValue } = data;
  const envValue = env ? Deno.env.get(env) : undefined;
  const rawValue = cli ?? envValue ?? defaultValue;
  if (transformer && rawValue !== defaultValue) {
    return transformer(rawValue);
  }
  return rawValue as T;
}

function trim(value: string): string {
  return value.trim();
}

function notEmpty(value: string): boolean {
  return value !== "";
}

/** Array-specific configuration parser with comma-separated env var support */
function parseConfigCollection(
  data: ConfigValue<string[]>,
  transformer?: (value: string[]) => string[],
): string[] {
  const { cli = [], env, defaultValue = [] } = data;
  const envValue = env ? Deno.env.get(env) : undefined;
  const cliValues = (cli || []).map(trim).filter(notEmpty);
  const envValues = (envValue ? envValue.split(",").map(trim) : []).filter(notEmpty);
  const combined = [...new Set([...cliValues, ...envValues])];
  const result = combined.length > 0 ? combined : defaultValue;
  return transformer ? transformer(result) : result;
}

/**
 * Parse the configuration directly from the CLI args and environment variables
 * @returns The parsed configuration
 * @see Deno.args
 */
function parseCliArgs(): AppConfig {
  const args = parseArgs(Deno.args, CLI_ARGS);
  return {
    allowedOrigins: parseConfigCollection(
      { cli: args.origin, env: ENV_VARS.ALLOWED_ORIGINS, defaultValue: ALLOWED_ORIGINS },
      validateOrigins,
    ),
    allowedHosts: parseConfigCollection(
      { cli: args.host, env: ENV_VARS.ALLOWED_HOSTS, defaultValue: ALLOWED_HOSTS },
      validateHosts,
    ),
    headers: parseConfigCollection(
      { cli: args.header, env: ENV_VARS.HEADERS, defaultValue: HEADERS },
      validateHeaders,
    ),
    help: parseConfigValue(
      { cli: args.help, env: undefined, defaultValue: false },
      (value) => Boolean(value),
    ),
    hostname: parseConfigValue(
      { cli: args.hostname, env: ENV_VARS.HOSTNAME, defaultValue: DEFAULT_HOSTNAME },
      (value) => validateHostname(String(value)),
    ),
    log: parseConfigValue(
      { cli: args.log, env: ENV_VARS.LOG, defaultValue: DEFAULT_LOG_LEVEL },
      (value) => validateLogLevel(String(value)),
    ) as LogLevelKey,
    noDnsRebinding: parseConfigValue(
      { cli: args["no-dns-rebinding"], env: ENV_VARS.NO_DNS_REBINDING, defaultValue: false },
      (value) => Boolean(value),
    ),
    noHttp: parseConfigValue(
      { cli: args["no-http"], env: ENV_VARS.NO_HTTP, defaultValue: false },
      (value) => Boolean(value),
    ),
    noStdio: parseConfigValue(
      { cli: args["no-stdio"], env: ENV_VARS.NO_STDIO, defaultValue: false },
      (value) => Boolean(value),
    ),
    port: parseConfigValue(
      {
        cli: args.port ? parseInt(args.port as string, 10) : undefined,
        env: ENV_VARS.PORT,
        defaultValue: DEFAULT_PORT,
      },
      (value) => {
        const parsed = typeof value === "string" ? parseInt(value, 10) : Number(value);
        if (isNaN(parsed)) {
          throw new Error(`Must be a number, got: ${value}`);
        }
        return validatePort(parsed);
      },
    ),
    version: parseConfigValue(
      { cli: args.version, env: undefined, defaultValue: false },
      (value) => Boolean(value),
    ),
  };
}

/**
 * Parse CLI arguments and exit early if the help or version flag is set
 * @returns The parsed configuration
 */
export function handleCliArgs(): AppConfig {
  const config = parseCliArgs();

  // Exit early if the help flag is set
  if (config.help) {
    console.error(`${helpText}`);
    Deno.exit(0);
  }

  // Exit early if the version flag is set
  if (config.version) {
    console.error(APP_VERSION_STR);
    Deno.exit(0);
  }

  return config;
}
