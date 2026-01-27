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
};

/** The configuration for the STDIO transport */
export type StdioConfig = {
  enabled: boolean;
};

/** Public app config */
export interface AppConfig {
  http: HttpServerConfig;
  stdio: StdioConfig;
}
