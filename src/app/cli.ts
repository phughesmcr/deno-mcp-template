import { Command, ValidationError } from "@cliffy/command";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import {
  APP_DESCRIPTION,
  APP_USAGE,
  APP_VERSION,
  DEFAULT_HOSTNAME,
  DEFAULT_PORT,
} from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";
import { validateConfig } from "$/shared/validation.ts";

export type CliCommand = Awaited<ReturnType<typeof createCommand>>;

export type CliOptions =
  & Omit<CliCommand["options"], "header" | "host" | "origin" | "noHttp" | "noStdio">
  & {
    http: boolean;
    stdio: boolean;
    headers: string[];
    allowedOrigins: string[];
    allowedHosts: string[];
  };

/** Merges two arrays of strings, removing duplicates */
function mergeArrays(a?: string[], b?: string[]): string[] {
  return [...new Set([...a ?? [], ...b ?? []])];
}

/** Prefix for environment variables */
const prefix = "MCP_";

function createCommand() {
  return new Command()
    .throwErrors()
    .name(APP_USAGE)
    .description(APP_DESCRIPTION)
    .version(APP_VERSION)
    .usage("[options]")
    .example(
      "Custom options",
      `$ ${APP_USAGE} -p ${DEFAULT_PORT} -n ${DEFAULT_HOSTNAME}`,
    )
    .example(
      "Use DNS rebinding protection",
      `$ ${APP_USAGE} --dnsRebinding --origin "https://example.com" --origin "https://localhost:3001" --host "example.com" --host "localhost"`,
    )
    .example(
      "Disable the STDIO server",
      `$ ${APP_USAGE} --no-stdio`,
    )
    .meta("Deno", Deno.version.deno)
    .meta("MCP Protocol", LATEST_PROTOCOL_VERSION)
    // STDIO server
    .option("--no-stdio", "Disable the STDIO server.", {
      conflicts: ["no-http"],
    })
    .env("NO_STDIO=<value:boolean>", "Disable the STDIO server.", { prefix })
    // HTTP server
    .option("--no-http", "Disable the HTTP server.", {
      conflicts: ["no-stdio"],
    })
    .env("NO_HTTP=<value:boolean>", "Disable the HTTP server.", { prefix })
    // Port
    .option("-p, --port <port:integer>", "Set the port.", {
      default: DEFAULT_PORT,
      conflicts: ["no-http"],
    })
    .env("PORT=<value:integer>", "Set the port.", { prefix })
    // Hostname
    .option("-n, --hostname <hostname:string>", "Set the hostname.", {
      default: DEFAULT_HOSTNAME,
      conflicts: ["no-http"],
    })
    .action(function (options) {
      if (options.port < 1 || options.port > 65535) {
        throw new ValidationError("Port must be between 1 and 65535");
      }
    })
    .env("HOSTNAME=<value:string>", "Set the hostname.", { prefix })
    // Headers
    .option("-H, --header <header:string>", "Set a custom header.", {
      collect: true,
      conflicts: ["no-http"],
    })
    .env("HEADERS=<value:string[]>", "Set custom headers.", { prefix })
    // DNS rebinding
    .option("--dnsRebinding", "Enable DNS rebinding protection.", {
      default: false,
      conflicts: ["no-http"],
      depends: ["origin", "host"],
    })
    .env("DNS_REBINDING=<value:boolean>", "Enable DNS rebinding protection.", { prefix })
    // Allowed origins
    .option("--origin <origin:string>", "Allow an origin for DNS rebinding.", {
      collect: true,
      conflicts: ["no-http"],
      depends: ["dnsRebinding"],
    })
    .env("ALLOWED_ORIGINS=<value:string[]>", "Allowed origins for DNS rebinding.", { prefix })
    // Allowed hosts
    .option("--host <host:string>", "Allow a host for DNS rebinding.", {
      collect: true,
      conflicts: ["no-http"],
      depends: ["dnsRebinding"],
    })
    .env("ALLOWED_HOSTS=<value:string[]>", "Allowed hosts for DNS rebinding.", { prefix })
    .parse(Deno.args);
}

function transformCliOptions(rawOptions: CliCommand["options"]): CliOptions {
  const {
    header,
    host,
    origin,
    noHttp: _noHttp,
    noStdio: _noStdio,
    headers: rawHeaders,
    allowedOrigins: rawAllowedOrigins,
    allowedHosts: rawAllowedHosts,
    ...cleanOptions
  } = rawOptions;

  return {
    ...cleanOptions,
    headers: mergeArrays(header, rawHeaders),
    allowedOrigins: mergeArrays(origin, rawAllowedOrigins),
    allowedHosts: mergeArrays(host, rawAllowedHosts),
  };
}

/**
 * Handles CLI argument parsing and validation
 * @returns The validated application configuration
 * @throws {Error} When validation fails or usage errors occur
 */
export async function handleCliArgs(): Promise<AppConfig> {
  try {
    const { options } = await createCommand();
    const transformedOptions = transformCliOptions(options);
    const config = validateConfig(transformedOptions);
    if (!config.success) throw config.error;
    return config.value;
  } catch (error) {
    if (error instanceof ValidationError) {
      error.cmd?.showHelp();
      console.error("Usage error: %s", error.message);
      Deno.exit(error.exitCode);
    } else {
      console.error("Runtime error: %s", error);
      Deno.exit(1);
    }
  }
}
