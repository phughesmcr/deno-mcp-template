import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type {
  CallToolResult,
  GetPromptResult,
  JSONRPCMessage,
  Prompt,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  Tool,
} from "@vendor/schema";
import type { LOG_LEVEL } from "./constants.ts";

/** An object that maps session IDs to transports */
export interface TransportRecord {
  [sessionId: string]: StreamableHTTPServerTransport;
}

/** Properties for the HTTP server */
export interface HttpServerConfig {
  /** The hostname to listen on */
  hostname: string;

  /** The port to listen on */
  port: number;

  /** The custom headers to set */
  headers: string[];

  /** The allowed origins */
  allowedOrigins: string[];

  /** The allowed hosts */
  allowedHosts: string[];
}

/** Public app config */
export interface AppConfig extends HttpServerConfig {
  /** The log level */
  log: LogLevelKey;
}

/** An event in the MCP event stream */
export type McpEvent = { streamId: string; message: JSONRPCMessage };

/** A function to send an event to the MCP event stream */
export type McpEventSender = (
  eventId: string,
  message: JSONRPCMessage,
) => Promise<void>;

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

export type LogLevelKey = keyof typeof LOG_LEVEL;
export type LogLevelValue = typeof LOG_LEVEL[LogLevelKey];
export type LogParams = Parameters<typeof console.error>;

export type LogData = {
  logger?: string;
  data: Record<string, unknown>;
};
