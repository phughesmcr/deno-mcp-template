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
  DEFAULT_PORT,
  ENV_VARS,
} from "../constants.ts";
import type { AppConfig } from "../types.ts";
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
    debug: !!args.debug || Deno.env.get(ENV_VARS.DEBUG)?.toLowerCase() === "true",
    hostname: getValidatedHostname(args.hostname),
    memoryFilePath: getValidatedMemoryFilePath(args.memoryFilePath as string | undefined),
    port: getValidatedPort(args.port.toString()),
    quiet: !!args.quiet || Deno.env.get(ENV_VARS.QUIET)?.toLowerCase() === "true",
    staticDir: import.meta.dirname ?? "",
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
  -m, --memory-file-path <PATH>  Path to memory file for knowledge graph
  -d, --debug                    Enable verbose logging (can be combined with -q to send debug logs to MCP server only)
  -q, --quiet                    Suppress logging to stderr (but not the MCP server logs)
  -H, --help                     Show this help message
  -V, --version                  Show version information

Environment Variables:
  PORT <number>                  Port to listen on
  HOSTNAME <string>              Hostname to bind to
  MEMORY_FILE_PATH <string>      Path to memory file for knowledge graph
  DEBUG <boolean>                Enable debug logging (true/false)
  QUIET <boolean>                Suppress logging to stderr (but not the MCP server logs)

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

/**
 * Validates and returns the memory file path from the CLI or environment variable
 * @param cliValue - The CLI value for the memory file path
 * @returns The validated memory file path or null if not provided
 */
function getValidatedMemoryFilePath(cliValue?: string): string | null {
  const value = (cliValue || Deno.env.get(ENV_VARS.MEMORY_FILE_PATH))?.trim();
  if (value === undefined || value === "") {
    return null;
  }

  try {
    const stats = Deno.statSync(value);
    if (!stats.isFile) {
      throw new Error(`Path exists but is not a file: ${value}`);
    }
  } catch (error) {
    // If file doesn't exist, create it
    if (error instanceof Deno.errors.NotFound) {
      try {
        const file = Deno.createSync(value);
        file?.close();
      } catch (createError) {
        throw new Error(`Cannot create memory file at ${value}: ${createError}`);
      }
    } else {
      throw error;
    }
  }

  return value;
}
