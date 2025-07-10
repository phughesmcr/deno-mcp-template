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
} from "../constants.ts";
import type { AppConfig, LogLevelKey } from "../types.ts";
import {
  validateHeaders,
  validateHostname,
  validateHosts,
  validateLogLevel,
  validateOrigins,
  validatePort,
} from "../utils.ts";

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
    allowedOrigins: getArrayConfig(
      args.origin,
      ENV_VARS.ALLOWED_ORIGINS,
      ALLOWED_ORIGINS,
      validateOrigins,
    ),
    allowedHosts: getArrayConfig(
      args.host,
      ENV_VARS.ALLOWED_HOSTS,
      ALLOWED_HOSTS,
      validateHosts,
    ),
    headers: getArrayConfig(
      args.header,
      ENV_VARS.HEADERS,
      HEADERS,
      validateHeaders,
    ),
    hostname: getStringConfig(
      args.hostname,
      ENV_VARS.HOSTNAME,
      DEFAULT_HOSTNAME,
      validateHostname,
    ),
    log: getStringConfig(
      args.log,
      ENV_VARS.LOG,
      DEFAULT_LOG_LEVEL,
      validateLogLevel,
    ) as LogLevelKey,
    noHttp: getBooleanConfig(
      args["no-http"],
      ENV_VARS.NO_HTTP,
      false,
    ),
    noStdio: getBooleanConfig(
      args["no-stdio"],
      ENV_VARS.NO_STDIO,
      false,
    ),
    port: getNumberConfig(
      args.port ? args.port.toString() : undefined,
      ENV_VARS.PORT,
      DEFAULT_PORT,
      validatePort,
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

function showVersion(): void {
  console.error(`${APP_NAME} v${APP_VERSION}`);
}

function showHelp(): void {
  showVersion();
  console.error(helpText);
}

function getBooleanConfig(
  cliValue: boolean,
  envVar: string,
  defaultValue: boolean,
): boolean {
  return !!(cliValue || Deno.env.get(envVar) || defaultValue);
}

function getStringConfig(
  cliValue: string | undefined,
  envVar: string,
  defaultValue: string,
  validator: (value: string) => string = (value) => value,
): string {
  const value = cliValue || Deno.env.get(envVar) || defaultValue;
  return validator(value);
}

function getNumberConfig(
  cliValue: string | undefined,
  envVar: string,
  defaultValue: number,
  validator: (value: number) => number = (value) => value,
): number {
  const value = cliValue || Deno.env.get(envVar) || defaultValue;
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value.toString(), 10);
  if (isNaN(parsed)) {
    throw new Error(`Must be a number, got: ${value}`);
  }
  return validator(parsed);
}

function getArrayConfig(
  cliValues: string[] | undefined,
  envVar: string,
  defaultValue: string[],
  validator: (value: string[]) => string[] = (value) => value,
): string[] {
  const envValue = Deno.env.get(envVar);
  const cli = (cliValues || []).map((v) => v.trim()).filter((v) => v !== "");
  const env = (envValue ? envValue.split(",").map((v) => v.trim()) : []).filter((v) => v !== "");
  const combined = [...new Set([...cli, ...env])];
  return validator(combined.length > 0 ? combined : defaultValue);
}
