/**
 * @description Configuration management and validation
 * @module
 */

import { parseArgs } from "@std/cli";
import { DEFAULT_HOSTNAME, DEFAULT_PORT } from "../constants.ts";
import { isValidHostname } from "./utils.ts";

export interface AppConfig {
  port: number;
  hostname: string;
  memoryFilePath?: string;
  enableDebugLogging: boolean;
}

const STRING_ARGS = ["port", "hostname", "memory-file-path"] as const;
const BOOLEAN_ARGS = ["debug", "help"] as const;
const ALIAS_ARGS: Partial<Record<StringArgs | BooleanArgs, string>> = {
  "port": "p",
  "hostname": "h",
  "memory-file-path": "m",
  "debug": "d",
};

export type StringArgs = (typeof STRING_ARGS)[number];
export type BooleanArgs = (typeof BOOLEAN_ARGS)[number];

/**
 * Validates and returns the application configuration
 * @note CLI flags take precedence over environment variables
 * @returns The validated configuration
 */
export function getConfig(): AppConfig {
  // Parse CLI arguments
  const args = parseArgs(Deno.args, {
    string: STRING_ARGS,
    boolean: BOOLEAN_ARGS,
    alias: ALIAS_ARGS,
    default: {
      debug: false,
    },
  });

  // Show help if requested
  if (args["help"]) {
    showHelp();
    Deno.exit(0);
  }

  return {
    port: getValidatedPort(args["port"]),
    hostname: getValidatedHostname(args["hostname"]),
    memoryFilePath: args["memory-file-path"] || Deno.env.get("MEMORY_FILE_PATH"),
    enableDebugLogging: args["debug"] || Deno.env.get("DEBUG") === "true",
  };
}

function showHelp(): void {
  console.log(`
Usage: deno run -A main.ts [OPTIONS]

Options:
  -p, --port <PORT>              Port to listen on (default: ${DEFAULT_PORT})
  -h, --hostname <HOSTNAME>      Hostname to bind to (default: ${DEFAULT_HOSTNAME})
  -m, --memory-file-path <PATH>  Path to memory file for knowledge graph
  -d, --debug                    Enable debug logging
      --help                     Show this help message

Environment Variables:
  PORT                    Port to listen on
  HOSTNAME               Hostname to bind to
  MEMORY_FILE_PATH       Path to memory file for knowledge graph
  DEBUG                  Enable debug logging (true/false)

Note: CLI flags take precedence over environment variables.
`);
}

function getValidatedPort(cliValue?: string): number {
  const value = cliValue || Deno.env.get("PORT");
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
  const value = cliValue || Deno.env.get("HOSTNAME");
  if (value === undefined) {
    return DEFAULT_HOSTNAME;
  }

  const hostname = value.trim();
  if (hostname === "") {
    return DEFAULT_HOSTNAME;
  }

  // Comprehensive hostname validation
  if (!isValidHostname(hostname)) {
    throw new Error(`Invalid hostname: ${hostname}. Must be a valid hostname or IP address.`);
  }

  return hostname;
}
