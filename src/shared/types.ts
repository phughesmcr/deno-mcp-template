/**
 * @description Shared types for the MCP server
 * @module
 */

import type {
  CallToolResult,
  GetPromptResult,
  Prompt,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import type { LOG_LEVEL } from "$/shared/constants.ts";

/** Acceptable log levels */
export type LogLevelKey = keyof typeof LOG_LEVEL;

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

/** The configuration for the logger */
export type LoggerConfig = {
  level: LogLevelKey;
};

/** The configuration for the STDIO transport */
export type StdioConfig = {
  enabled: boolean;
};

/** Public app config */
export interface AppConfig {
  http: HttpServerConfig;
  log: LoggerConfig;
  stdio: StdioConfig;
}

// **************************
// Modules
// **************************

/** A wrapper for all the required properties for a handling a prompt */
export interface PromptModule<T extends Record<string, string>> {
  readonly prompt: Prompt;
  readonly request: (args: T) => Promise<GetPromptResult>;
}

/** A wrapper for all the required properties for a handling a resource */
export interface ResourceModule {
  readonly resource: Resource;
  readonly request: () => Promise<ReadResourceResult>;
}

/** A wrapper for all the required properties for a handling a resource template */
export interface ResourceTemplateModule<T> {
  readonly resourceTemplate: ResourceTemplate;
  readonly request: (
    request: { params: { uri: string } },
    ...args: T[]
  ) => Promise<ReadResourceResult>;
}

/** A wrapper for all the required properties for a handling a tool */
export interface ToolModule<T extends Record<string, unknown>> {
  readonly name: string;
  readonly tools: Tool[];
  readonly methods: {
    // deno-lint-ignore no-explicit-any
    [key in keyof T]: (...args: any[]) => Promise<CallToolResult>;
  };
  readonly request: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
}
