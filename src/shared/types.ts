/**
 * @description Shared types for the MCP server
 * @module
 */

import type {
  McpServer,
  ReadResourceCallback,
  ReadResourceTemplateCallback,
  ResourceMetadata,
  ResourceTemplate,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod/v3";

export type Prettify<T> =
  & {
    [K in keyof T]: T[K];
  }
  // deno-lint-ignore ban-types
  & {};

export interface Transport {
  /** Connects the transport to the MCP server */
  connect: () => void;
  /** Disconnects the transport from the MCP server */
  disconnect: () => Promise<void>;
  /** Checks if the transport is enabled */
  isEnabled: () => boolean;
  /** Checks if the transport is running */
  isRunning: () => boolean;
}

/** Prompt parameters */
export type PromptPlugin = Parameters<McpServer["registerPrompt"]>;

/** Resource parameters */
export type ResourcePlugin = {
  type: "resource";
  name: string;
  uri: string;
  config: ResourceMetadata;
  readCallback: ReadResourceCallback;
};

/** Resource template parameters */
export type ResourceTemplatePlugin = {
  type: "template";
  name: string;
  template: ResourceTemplate;
  config: ResourceMetadata;
  readCallback: ReadResourceTemplateCallback;
};

export type AnyResourcePlugin = ResourcePlugin | ResourceTemplatePlugin;

/** Tool parameters */
export type ToolPlugin = [
  name: string,
  // deno-lint-ignore no-explicit-any
  config: ToolConfig<any, any>,
  // deno-lint-ignore no-explicit-any
  cb: ToolCallback<any>,
];

/** Tool configuration */
export type ToolConfig<
  InputArgs extends ZodRawShape | undefined = undefined,
  OutputArgs extends ZodRawShape | undefined = undefined,
> = {
  title?: string;
  description?: string;
  inputSchema?: InputArgs;
  outputSchema?: OutputArgs;
  annotations?: ToolAnnotations;
};

/** Internal tool definition */
export type ToolModule<
  InputArgs extends ZodRawShape | undefined = undefined,
  OutputArgs extends ZodRawShape | undefined = undefined,
> = [
  name: string,
  config: ToolConfig<InputArgs, OutputArgs>,
  // deno-lint-ignore no-explicit-any
  callbackFactory: (mcp: McpServer) => ToolCallback<any>,
];

// **************************
// Config
// **************************

/** The configuration for the HTTP server */
export type HttpServerConfig = {
  enabled: boolean;

  /** The hostname to listen on */
  hostname: string;

  /** The port to listen on */
  port: number;

  /** The custom headers to set */
  headers?: string[];

  /** Whether to enable DNS rebinding protection */
  enableDnsRebinding?: boolean;

  /** The allowed origins */
  allowedOrigins?: string[];

  /** The allowed hosts */
  allowedHosts?: string[];

  /** Whether to use JSON-only responses (disable SSE streaming) */
  jsonResponseMode?: boolean;

  /** Optional TLS certificate file path in PEM format */
  tlsCert?: string;

  /** Optional TLS private key file path in PEM format */
  tlsKey?: string;

  /**
   * When true, derive client IP from `cf-connecting-ip`, `x-forwarded-for` (first hop), then `x-real-ip`
   * for rate limiting. Unsafe without a trusted reverse proxy (clients can spoof these headers).
   */
  trustProxy?: boolean;

  /**
   * When set, HTTP `/mcp` requires `Authorization: Bearer <token>` or `x-api-key: <token>`.
   * Prefer `MCP_HTTP_BEARER_TOKEN` over CLI flags (process list visibility).
   */
  httpBearerToken?: string;

  /**
   * Public origin for browser URLs (URL-mode elicitation, links in tool errors). No trailing slash.
   * When unset and HTTP is enabled, derived from bind address (127.0.0.1 when hostname is all-interfaces).
   * Set `MCP_PUBLIC_BASE_URL` behind a reverse proxy.
   */
  publicBaseUrl?: string;
};

/** The configuration for the STDIO transport */
export type StdioConfig = {
  enabled: boolean;
};

/** The configuration for Deno KV */
export type KvConfig = {
  /** Optional file path for Deno KV storage */
  path?: string;
};

/** Task store limits (MCP experimental tasks). */
export type TasksConfig = {
  /**
   * Upper bound for requested task TTL in milliseconds. Values above this are clamped;
   * `null` / unlimited client TTL remains unlimited.
   */
  maxTtlMs: number;
};

/** Public app config */
export interface AppConfig {
  http: HttpServerConfig;
  stdio: StdioConfig;
  kv: KvConfig;
  tasks: TasksConfig;
}
