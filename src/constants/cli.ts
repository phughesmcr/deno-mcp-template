/**
 * @description CLI argument and help text constants
 * @module
 */

import { APP_NAME, APP_VERSION_STR } from "./app.ts";
import { DEFAULT_CONFIG } from "./config.ts";

export const CLI_ARGS = {
  string: ["port", "hostname", "log", "header", "origin", "host"],
  boolean: ["help", "version", "no-http", "no-stdio", "no-dns-rebinding"],
  collect: ["origin", "host", "header"],
  alias: {
    "help": "h",
    "header": "H",
    "hostname": "n",
    "log": "l",
    "port": "p",
    "version": "v",
  },
  default: {
    "help": DEFAULT_CONFIG.help,
    "hostname": DEFAULT_CONFIG.hostname,
    "log": DEFAULT_CONFIG.log,
    "port": DEFAULT_CONFIG.port,
    "version": DEFAULT_CONFIG.version,
    "no-http": DEFAULT_CONFIG.noHttp,
    "no-stdio": DEFAULT_CONFIG.noStdio,
    "no-dns-rebinding": DEFAULT_CONFIG.noDnsRebinding,
  },
} as const;

// Help text template function to keep showHelp() simple
export const helpText: string = (() => {
  const usage = Deno.build.standalone ? (import.meta.filename || APP_NAME) : "deno task start";

  return `
${APP_VERSION_STR}

Usage: ${usage} [OPTIONS]

Examples: 

$ ${usage} -p ${DEFAULT_CONFIG.port} -n ${DEFAULT_CONFIG.hostname} -l ${DEFAULT_CONFIG.log}

$ ${usage} --origin "https://example.com" --origin "https://localhost:3001" --host "example.com" --host "localhost"

$ ${usage} --header "Authorization: Bearer <token>" -H "x-api-key: <key>"

Options:
  -p,  --port <PORT>                Port to listen on (default: ${DEFAULT_CONFIG.port})
  -n,  --hostname <HOSTNAME>        Hostname to bind to (default: ${DEFAULT_CONFIG.hostname})
  -l,  --log <LEVEL>                Log level (default: ${DEFAULT_CONFIG.log})
  -H,  --header [<HEADER>]          Custom headers to set
       --origin [<ORIGIN>]          Allow an origin
       --host [<HOST>]              Allow a host
       --no-dns-rebinding           Disable DNS rebinding protection
       --no-http                    Disable the HTTP server
       --no-stdio                   Disable the STDIO server
  -h,  --help                       Show this help message
  -v,  --version                    Show version information

Environment Variables:
  MCP_PORT <number>                  Port to listen on (default: ${DEFAULT_CONFIG.port})
  MCP_HOSTNAME <string>              Hostname to bind to (default: ${DEFAULT_CONFIG.hostname})
  MCP_LOG_LEVEL <string>             Log level (default: ${DEFAULT_CONFIG.log})
  MCP_ALLOWED_ORIGINS <string>       Comma-separated list of allowed origins
  MCP_ALLOWED_HOSTS <string>         Comma-separated list of allowed hosts
  MCP_HEADERS <string>               Comma-separated list of custom headers to set
  MCP_NO_HTTP <boolean>              Disable the HTTP server
  MCP_NO_STDIO <boolean>             Disable the STDIO server
  MCP_NO_DNS_REBINDING <boolean>     Disable DNS rebinding protection

Note: CLI flags take precedence over environment variables, except collections which are merged.
`;
})();
