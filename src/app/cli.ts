import { Command, ValidationError } from "@cliffy/command";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import {
  APP_DESCRIPTION,
  APP_USAGE,
  APP_VERSION,
  DEFAULT_HOSTNAME,
  DEFAULT_PORT,
} from "$/shared/constants.ts";
import { mergeArrays } from "$/shared/utils.ts";

export type CliCommand = Awaited<ReturnType<typeof createCommand>>;

export type CliOptions =
  & Omit<CliCommand["options"], "header" | "host" | "origin" | "noHttp" | "noStdio">
  & {
    headers: string[];
    allowedOrigins: string[];
    allowedHosts: string[];
  };

async function createCommand() {
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
      depends: ["dnsRebinding"],
    })
    .env("MCP_ALLOWED_ORIGINS=<value:string[]>", "Allowed origins for DNS rebinding.", {
      prefix: "MCP_",
    })
    // Allowed hosts
    .option("--host <host:string>", "Allow a host for DNS rebinding.", {
      collect: true,
      conflicts: ["no-http"],
      depends: ["dnsRebinding"],
    })
    .env("MCP_ALLOWED_HOSTS=<value:string[]>", "Allowed hosts for DNS rebinding.", {
      prefix: "MCP_",
    })
    .parse(Deno.args);
}

export async function handleCliArgs(): Promise<CliOptions> {
  try {
    const { options } = await createCommand();
    // concat arrays
    const result = {
      ...options,
      ...{
        headers: mergeArrays(options.header, options.headers),
        allowedOrigins: mergeArrays(options.origin, options.allowedOrigins),
        allowedHosts: mergeArrays(options.host, options.allowedHosts),
      },
    };
    // delete leftover keys
    delete result.header;
    delete result.host;
    delete result.origin;
    delete result.noHttp;
    delete result.noStdio;
    // check if both servers are disabled
    if (!result.http && !result.stdio) {
      throw new Error(
        "Both the HTTP and the STDIO servers are disabled. Please enable at least one server.",
      );
    }
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
