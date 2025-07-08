/**
 * @description Configuration management and validation for setting-up the app
 * @module
 */

import { parseArgs } from "@std/cli";

import {
  APP_NAME,
  APP_VERSION,
  CLI_ARGS,
  DEFAULT_HOSTNAME,
  DEFAULT_LOG_LEVEL,
  DEFAULT_PORT,
  ENV_VARS,
  VALID_LOG_LEVELS,
} from "../constants.ts";
import type { AppConfig, LogLevelKey } from "../types.ts";
import { isValidHostname } from "../utils.ts";

/**
 * Validates and returns the application configuration
 * @note CLI flags take precedence over environment variables
 * @returns The validated configuration
 */
export function getConfig(): AppConfig {
  // Parse CLI arguments
  const args = parseArgs(Deno.args, CLI_ARGS);

  // Show help if requested
  if (args.help) {
    showHelp();
    Deno.exit(0);
  }

  // Show version if requested
  if (args.version) {
    showVersion();
    Deno.exit(0);
  }

  return {
    hostname: getValidatedHostname(args.hostname),
    log: getValidatedLogLevel(args.log),
    port: getValidatedPort(args.port.toString()),
  };
}

/** Shows the name and version of the application */
function showVersion(): void {
  console.error(`${APP_NAME} v${APP_VERSION}`);
}

/** Shows the help message for the application */
function showHelp(): void {
  const usage = Deno.build.standalone ? import.meta.filename : "deno task start";

  showVersion();

  console.error(`
Usage: ${usage} [OPTIONS]

Options:
  -p, --port <PORT>              Port to listen on (default: ${DEFAULT_PORT})
  -h, --hostname <HOSTNAME>      Hostname to bind to (default: ${DEFAULT_HOSTNAME})
  -l, --log <LEVEL>              Log level (default: info)
  -H, --help                     Show this help message
  -V, --version                  Show version information

Environment Variables:
  MCP_PORT <number>                  Port to listen on
  MCP_HOSTNAME <string>              Hostname to bind to
  MCP_LOG_LEVEL <string>             Log level (default: info)

Note: CLI flags take precedence over environment variables.
`);
}

/** Validates and returns the port from the CLI or environment variable */
function getValidatedPort(cliValue?: string): number {
  const value = cliValue || Deno.env.get(ENV_VARS.PORT);
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const port = parseInt(value, 10);
  if (isNaN(port)) {
    throw new Error(`Port must be a number, got: ${value}`);
  }

  if (port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}. Must be between 1 and 65535.`);
  }

  return port;
}

function getValidatedHostname(cliValue?: string): string {
  const value = cliValue || Deno.env.get(ENV_VARS.HOSTNAME);
  if (value === undefined) {
    return DEFAULT_HOSTNAME;
  }

  const hostname = value.trim();
  if (hostname === "") {
    return DEFAULT_HOSTNAME;
  }

  // Comprehensive hostname validation
  if (!isValidHostname(hostname)) {
    throw new Error(
      `Invalid hostname: ${hostname}. Must be a valid hostname or IP address.`,
    );
  }

  return hostname;
}

function getValidatedLogLevel(cliValue?: string): LogLevelKey {
  const value = cliValue || Deno.env.get(ENV_VARS.LOG);
  if (value === undefined) {
    return DEFAULT_LOG_LEVEL;
  }

  const logLevel = value.trim().toLowerCase();
  if (logLevel === "") {
    return DEFAULT_LOG_LEVEL;
  }

  if (!VALID_LOG_LEVELS.includes(logLevel as LogLevelKey)) {
    throw new Error(
      `Invalid log level: ${logLevel}. Must be one of: ${VALID_LOG_LEVELS.join(", ")}.`,
    );
  }

  return logLevel as LogLevelKey;
}
