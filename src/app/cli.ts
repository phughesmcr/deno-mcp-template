import { Command, EnumType, ValidationError } from "@cliffy/command";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import {
  APP_DESCRIPTION,
  APP_USAGE,
  APP_VERSION,
  DEFAULT_HOSTNAME,
  DEFAULT_LOG_LEVEL,
  DEFAULT_PORT,
  VALID_LOG_LEVELS,
} from "$/shared/constants.ts";
import type { LogLevelKey } from "$/shared/types.ts";

const logLevel = new EnumType<LogLevelKey>(VALID_LOG_LEVELS);

async function createCommand() {
  return new Command()
    .throwErrors()
    .name(APP_USAGE)
    .description(APP_DESCRIPTION)
    .version(APP_VERSION)
    .usage("[options]")
    .example(
      "Custom options",
      `$ ${APP_USAGE} -p ${DEFAULT_PORT} -n ${DEFAULT_HOSTNAME} -l ${DEFAULT_LOG_LEVEL}`,
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
    // Log level
    .type("logLevel", logLevel)
    .option("-l, --logLevel <level:logLevel>", "Set the log level.", {
      default: DEFAULT_LOG_LEVEL,
    })
    .env("MCP_LOG_LEVEL=<value:logLevel>", "Set the log level.", {
      prefix: "MCP_",
    })
    // STDIO server
    .option("--no-stdio", "Disable the STDIO server.", {
      conflicts: ["no-http"],
    })
    .env("MCP_NO_STDIO=<value:boolean>", "Disable the STDIO server.", {
      prefix: "MCP_",
    })
    // HTTP server
    .option("--no-http", "Disable the HTTP server.", {
      conflicts: ["no-stdio"],
    })
    .env("MCP_NO_HTTP=<value:boolean>", "Disable the HTTP server.", {
      prefix: "MCP_",
    })
    // Port
    .option("-p, --port <port:integer>", "Set the port.", {
      default: DEFAULT_PORT,
      conflicts: ["no-http"],
    })
    .env("MCP_PORT=<value:integer>", "Set the port.", { prefix: "MCP_" })
    // Hostname
    .option("-n, --hostname <hostname:string>", "Set the hostname.", {
      default: DEFAULT_HOSTNAME,
      conflicts: ["no-http"],
    })
    .env("MCP_HOSTNAME=<value:string>", "Set the hostname.", { prefix: "MCP_" })
    // Headers
    .option("-H, --header <header:string>", "Set a custom header.", {
      collect: true,
      conflicts: ["no-http"],
    })
    .env("MCP_HEADERS=<value:string[]>", "Set custom headers.", {
      prefix: "MCP_",
    })
    // DNS rebinding
    .option("--dnsRebinding", "Enable DNS rebinding protection.", {
      default: false,
      conflicts: ["no-http"],
      depends: ["origin", "host"],
    })
    .env("MCP_DNS_REBINDING=<value:boolean>", "Enable DNS rebinding protection.", {
      prefix: "MCP_",
    })
    // Allowed origins
    .option("--origin <origin:string>", "Allow an origin for DNS rebinding.", {
      collect: true,
      conflicts: ["no-http"],
    })
    .env("MCP_ALLOWED_ORIGINS=<value:string[]>", "Allowed origins for DNS rebinding.", {
      prefix: "MCP_",
    })
    // Allowed hosts
    .option("--host <host:string>", "Allow a host for DNS rebinding.", {
      collect: true,
      conflicts: ["no-http"],
    })
    .env("MCP_ALLOWED_HOSTS=<value:string[]>", "Allowed hosts for DNS rebinding.", {
      prefix: "MCP_",
    })
    .parse(Deno.args);
}

export type CliCommand = Awaited<ReturnType<typeof createCommand>>;

export type CliOptions =
  & Omit<CliCommand["options"], "header" | "host" | "origin" | "noHttp" | "noStdio">
  & {
    headers: string[];
    allowedOrigins: string[];
    allowedHosts: string[];
  };

export async function handleCliArgs(): Promise<CliOptions> {
  try {
    const { options } = await createCommand();
    const concatenated = {
      headers: [...new Set([...(options.header ?? []), ...(options.headers ?? [])])],
      allowedOrigins: [...new Set([...(options.origin ?? []), ...(options.allowedOrigins ?? [])])],
      allowedHosts: [...new Set([...(options.host ?? []), ...(options.allowedHosts ?? [])])],
    };
    const result = {
      ...options,
      ...concatenated,
    };
    delete result.header;
    delete result.host;
    delete result.origin;
    delete result.noHttp;
    delete result.noStdio;
    return result as CliOptions;
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
