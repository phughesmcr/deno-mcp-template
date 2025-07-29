/**
 * @description Shared types for the MCP server
 * @module
 */

import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod/v3";

/** Prompt parameters */
export type PromptPlugin = Parameters<McpServer["registerPrompt"]>;

/** Resource parameters */
export type ResourcePlugin = Parameters<McpServer["registerResource"]>;

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
