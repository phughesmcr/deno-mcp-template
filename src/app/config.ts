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

// Help text template function to keep showHelp() simple
function getHelpText(): string {
  const usage = Deno.build.standalone ? (import.meta.filename || APP_NAME) : "deno task start";

  return `
Usage: ${usage} [OPTIONS]

Examples: 

$ ${usage} -p 3001 -h localhost -l debug

$ ${usage} --origin "https://example.com" --origin "https://localhost:3001" --host "example.com" --host "localhost"

$ ${usage} --header "Authorization: Bearer <token>" --header "x-api-key: <key>"

Options:
  -p,  --port <PORT>                Port to listen on (default: ${DEFAULT_PORT})
  -h,  --hostname <HOSTNAME>        Hostname to bind to (default: ${DEFAULT_HOSTNAME})
  -l,  --log <LEVEL>                Log level (default: info)
       --header [<HEADERS>]         Custom headers to set
       --origin [<ORIGIN>]          Allow an origin
       --host [<HOST>]              Allow a host
       --help                       Show this help message
  -V,  --version                    Show version information

Environment Variables:
  MCP_PORT <number>                  Port to listen on
  MCP_HOSTNAME <string>              Hostname to bind to
  MCP_LOG_LEVEL <string>             Log level (default: info)
  MCP_ALLOWED_ORIGINS <string>       Comma-separated list of allowed origins
  MCP_ALLOWED_HOSTS <string>         Comma-separated list of allowed hosts
  MCP_HEADERS <string>               Comma-separated list of custom headers to set

Note: CLI flags take precedence over environment variables.
`;
}

function showVersion(): void {
  console.error(`${APP_NAME} v${APP_VERSION}`);
}

function showHelp(): void {
  showVersion();
  console.error(getHelpText());
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
