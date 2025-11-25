/**
 * @description Shared types for the MCP server
 * @module
 */

import type {
  McpServer,
  ReadResourceCallback,
  ReadResourceTemplateCallback,
  ResourceMetadata,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ResourceTemplate, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod/v3";

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
export type ResourcePlugin = [
  name: string,
  uri: string,
  config: ResourceMetadata,
  readCallback: ReadResourceCallback,
];

/** Resource template parameters */
export type ResourceTemplatePlugin = [
  name: string,
  template: ResourceTemplate,
  config: ResourceMetadata,
  readCallback: ReadResourceTemplateCallback,
];

/** Tool parameters */
export type ToolPlugin = Parameters<McpServer["registerTool"]>;

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
