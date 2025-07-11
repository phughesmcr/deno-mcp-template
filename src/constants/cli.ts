/**
 * @description CLI argument and help text constants
 * @module
 */

import { APP_NAME, DEFAULT_LOG_LEVEL } from "./app.ts";
import { DEFAULT_HOSTNAME, DEFAULT_PORT } from "./http.ts";

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
    "help": false,
    "hostname": DEFAULT_HOSTNAME,
    "log": DEFAULT_LOG_LEVEL,
    "port": DEFAULT_PORT,
    "version": false,
    "no-http": false,
    "no-stdio": false,
    "no-dns-rebinding": false,
  },
} as const;

// Help text template function to keep showHelp() simple
export const helpText: string = (() => {
  const usage = Deno.build.standalone ? (import.meta.filename || APP_NAME) : "deno task start";

  return `
Usage: ${usage} [OPTIONS]

Examples: 

$ ${usage} -p 3001 -n localhost -l debug

$ ${usage} --origin "https://example.com" --origin "https://localhost:3001" --host "example.com" --host "localhost"

$ ${usage} --header "Authorization: Bearer <token>" -H "x-api-key: <key>"

Options:
  -p,  --port <PORT>                Port to listen on (default: ${DEFAULT_PORT})
  -n,  --hostname <HOSTNAME>        Hostname to bind to (default: ${DEFAULT_HOSTNAME})
  -l,  --log <LEVEL>                Log level (default: ${DEFAULT_LOG_LEVEL})
  -H,  --header [<HEADER>]         Custom headers to set
       --origin [<ORIGIN>]          Allow an origin
       --host [<HOST>]              Allow a host
       --no-dns-rebinding           Disable DNS rebinding protection
       --no-http                    Disable the HTTP server
       --no-stdio                   Disable the STDIO server
  -h,  --help                       Show this help message
  -v,  --version                    Show version information

Environment Variables:
  MCP_PORT <number>                  Port to listen on (default: ${DEFAULT_PORT})
  MCP_HOSTNAME <string>              Hostname to bind to (default: ${DEFAULT_HOSTNAME})
  MCP_LOG_LEVEL <string>             Log level (default: ${DEFAULT_LOG_LEVEL})
  MCP_ALLOWED_ORIGINS <string>       Comma-separated list of allowed origins
  MCP_ALLOWED_HOSTS <string>         Comma-separated list of allowed hosts
  MCP_HEADERS <string>               Comma-separated list of custom headers to set
  MCP_NO_HTTP <boolean>              Disable the HTTP server
  MCP_NO_STDIO <boolean>             Disable the STDIO server
  MCP_NO_DNS_REBINDING <boolean>     Disable DNS rebinding protection

Note: CLI flags take precedence over environment variables.
`;
})();
