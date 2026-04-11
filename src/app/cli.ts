import { Command, ValidationError } from "@cliffy/command";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

import { denoFileStatPort } from "$/app/denoFileStatPort.ts";
import type { McpConfigInput, ValidateConfigDeps } from "$/shared/config-input.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import {
  APP_DESCRIPTION,
  APP_USAGE,
  APP_VERSION,
  DEFAULT_HOSTNAME,
  DEFAULT_MAX_TASK_TTL_MS,
  DEFAULT_PORT,
} from "$/shared/constants.ts";
import { validateConfig } from "$/shared/validation.ts";

function buildCommand() {
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
    .env("MCP_NO_STDIO=<value:boolean>", "Disable the STDIO server.", { prefix: "MCP_" })
    // HTTP server
    .option("--no-http", "Disable the HTTP server.", {
      conflicts: ["no-stdio"],
    })
    .env("MCP_NO_HTTP=<value:boolean>", "Disable the HTTP server.", { prefix: "MCP_" })
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
    // TLS certificate
    .option("--tls-cert <path:string>", "Path to TLS certificate file (PEM).", {
      conflicts: ["no-http"],
      depends: ["tls-key"],
    })
    .env("MCP_TLS_CERT=<value:string>", "Path to TLS certificate file (PEM).", { prefix: "MCP_" })
    // TLS private key
    .option("--tls-key <path:string>", "Path to TLS private key file (PEM).", {
      conflicts: ["no-http"],
      depends: ["tls-cert"],
    })
    .env("MCP_TLS_KEY=<value:string>", "Path to TLS private key file (PEM).", { prefix: "MCP_" })
    // KV path
    .option("--kv-path <path:string>", "Path to the Deno KV database file.")
    .env("MCP_KV_PATH=<value:string>", "Path to the Deno KV database file.", { prefix: "MCP_" })
    // Task TTL ceiling (MCP experimental tasks)
    .option(
      "--max-task-ttl-ms <ms:integer>",
      "Maximum task TTL in ms (client requests are clamped).",
      { default: DEFAULT_MAX_TASK_TTL_MS },
    )
    .env(
      "MCP_MAX_TASK_TTL_MS=<value:integer>",
      "Maximum task TTL in ms (client requests are clamped).",
      { prefix: "MCP_" },
    )
    // Headers
    .option("-H, --header <header:string>", "Set a custom header.", {
      collect: true,
      conflicts: ["no-http"],
    })
    .env("MCP_HEADERS=<value:string[]>", "Set custom headers.", { prefix: "MCP_" })
    // JSON response mode
    .option("--json-response", "Enable JSON-only responses (disable SSE streaming).", {
      default: false,
      conflicts: ["no-http"],
    })
    .env("MCP_JSON_RESPONSE=<value:boolean>", "Enable JSON-only responses.", { prefix: "MCP_" })
    // DNS rebinding
    .option("--dnsRebinding", "Enable DNS rebinding protection.", {
      default: false,
      conflicts: ["no-http"],
      depends: ["origin", "host"],
    })
    .env("MCP_DNS_REBINDING=<value:boolean>", "Enable DNS rebinding protection.", {
      prefix: "MCP_",
    })
    // Trust proxy headers for rate limiting
    .option("--trust-proxy", "Trust proxy headers for client IP (rate limiting only).", {
      default: false,
      conflicts: ["no-http"],
    })
    .env(
      "MCP_TRUST_PROXY=<value:boolean>",
      "Trust CF / X-Forwarded-For / X-Real-IP for rate limits.",
      {
        prefix: "MCP_",
      },
    )
    // HTTP MCP bearer auth
    .option(
      "--http-bearer-token <token:string>",
      "Shared secret for HTTP MCP (prefer MCP_HTTP_BEARER_TOKEN env).",
      { conflicts: ["no-http"] },
    )
    .env("MCP_HTTP_BEARER_TOKEN=<value:string>", "Bearer token for HTTP /mcp requests.", {
      prefix: "MCP_",
    })
    .option(
      "--require-http-auth",
      "Require MCP_HTTP_BEARER_TOKEN (or --http-bearer-token); exit if unset.",
      { default: false, conflicts: ["no-http"] },
    )
    .env(
      "MCP_REQUIRE_HTTP_AUTH=<value:boolean>",
      "Fail startup when no HTTP bearer token is configured.",
      { prefix: "MCP_" },
    )
    .option(
      "--public-base-url <url:string>",
      "Public origin for browser links (URL elicitation). Prefer MCP_PUBLIC_BASE_URL.",
      { conflicts: ["no-http"] },
    )
    .env(
      "MCP_PUBLIC_BASE_URL=<value:string>",
      "Public http(s) origin for URL-mode elicitation (no trailing slash).",
      { prefix: "MCP_" },
    )
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
    });
}

export type CliBuiltCommand = ReturnType<typeof buildCommand>;
export type CliParseResult = Awaited<ReturnType<CliBuiltCommand["parse"]>>;
export type CliRawOptions = CliParseResult["options"];

/** @deprecated Use {@link McpConfigInput} — alias kept for existing test imports. */
export type CliOptions = McpConfigInput;

/** Merges two arrays of strings, removing duplicates */
function mergeArrays(a?: string[], b?: string[]): string[] {
  return [...new Set([...a ?? [], ...b ?? []])];
}

/**
 * Maps Cliffy-parsed options to neutral {@link McpConfigInput} (merges `-H` with `headers`, etc.).
 */
export function mapCommandOptionsToConfigInput(rawOptions: CliRawOptions): McpConfigInput {
  const {
    header,
    host,
    origin,
    noHttp: _noHttp,
    noStdio: _noStdio,
    headers: rawHeaders,
    allowedOrigins: rawAllowedOrigins,
    allowedHosts: rawAllowedHosts,
    trustProxy: rawTrustProxy,
    requireHttpAuth: rawRequireHttpAuth,
    httpBearerToken: rawHttpBearerToken,
    publicBaseUrl: rawPublicBaseUrl,
    ...cleanOptions
  } = rawOptions;

  return {
    ...cleanOptions,
    trustProxy: rawTrustProxy ?? false,
    requireHttpAuth: rawRequireHttpAuth ?? false,
    httpBearerToken: rawHttpBearerToken,
    publicBaseUrl: rawPublicBaseUrl,
    headers: mergeArrays(header, rawHeaders),
    allowedOrigins: mergeArrays(origin, rawAllowedOrigins),
    allowedHosts: mergeArrays(host, rawAllowedHosts),
  };
}

export type LoadAppConfigOptions = {
  /** Argv passed to Cliffy (default: `Deno.args`). */
  argv?: readonly string[];
  /** When validation or parse fails: exit like `main` or rethrow (for tests). */
  onFailure?: "exit" | "throw";
  /** Validation dependencies (default: `{ files: denoFileStatPort }`). */
  deps?: ValidateConfigDeps;
};

function handleCliFailure(error: unknown, onFailure: "exit" | "throw"): never {
  if (onFailure === "throw") {
    throw error;
  }
  if (error instanceof ValidationError) {
    error.cmd?.showHelp();
    console.error("Usage error: %s", error.message);
    Deno.exit(error.exitCode);
  } else {
    console.error("Runtime error: %s", error);
    Deno.exit(1);
  }
}

/**
 * Parse argv → {@link McpConfigInput} → {@link validateConfig}. Production entry for config loading.
 */
export async function loadAppConfig(
  options: LoadAppConfigOptions = {},
): Promise<AppConfig> {
  const argv = options.argv ?? Deno.args;
  const onFailure = options.onFailure ?? "exit";
  const deps = options.deps ?? { files: denoFileStatPort };
  try {
    const cmd = buildCommand();
    const { options: rawOptions } = await cmd.parse([...argv]);
    const input = mapCommandOptionsToConfigInput(rawOptions);
    const config = validateConfig(input, deps);
    if (!config.success) throw config.error;
    return config.value;
  } catch (error) {
    handleCliFailure(error, onFailure);
  }
}

/**
 * Handles CLI argument parsing and validation (exits process on failure).
 */
export async function handleCliArgs(): Promise<AppConfig> {
  return await loadAppConfig();
}
