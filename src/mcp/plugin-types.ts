/**
 * @description MCP feature registration helpers (tools, prompts, resources). Import from here in new tools, prompts, and resources.
 * @module
 */

import type {
  CacheHint,
  CallToolResult,
  GetPromptResult,
  InputRequiredResult,
  McpServer,
  PromptCallback,
  ReadResourceResult,
  ResourceMetadata,
  ResourceTemplate,
  ServerContext,
  StandardSchemaWithJSON,
  ToolAnnotations,
  ToolCallback,
  Variables,
} from "@modelcontextprotocol/server";

import type { McpServerFactoryContext } from "./context.ts";

type MaybePromise<T> = T | Promise<T>;

/** Deno / host runtime needs for a tool (used by permission preflight). */
export type ToolRuntimeMetadata = {
  /** Tool performs outbound network I/O (fetch, sandbox API, etc.) when invoked. */
  requiresNet?: boolean;
};

/** Tool definition passed to {@link defineTool}. `args` arrive already validated. */
export type ToolDefinition<Input extends StandardSchemaWithJSON> = {
  name: string;
  title?: string;
  description?: string;
  /** Use `z.object({})` for tools without arguments. */
  inputSchema: Input;
  outputSchema?: StandardSchemaWithJSON;
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
  /** Declared host/runtime needs; keep in sync with actual tool behavior. */
  runtime?: ToolRuntimeMetadata;
  handler: (
    args: StandardSchemaWithJSON.InferOutput<Input>,
    ctx: ServerContext,
    deps: McpServerFactoryContext,
  ) => MaybePromise<CallToolResult | InputRequiredResult>;
};

/** A tool ready to attach to a server instance. */
export type ToolPlugin = {
  name: string;
  runtime?: ToolRuntimeMetadata;
  register: (server: McpServer, deps: McpServerFactoryContext) => void;
};

/** An MCP App: registers its own tool and `ui://` resource, so it has the shape of a tool. */
export type AppPlugin = ToolPlugin;

/** Wraps a tool so {@link ToolDefinition.handler} also receives the shared app context. */
export function defineTool<Input extends StandardSchemaWithJSON>(
  definition: ToolDefinition<Input>,
): ToolPlugin {
  const { name, runtime, handler, ...config } = definition;
  return {
    name,
    runtime,
    register(server, deps) {
      const callback = (args: StandardSchemaWithJSON.InferOutput<Input>, ctx: ServerContext) =>
        handler(args, ctx, deps);
      server.registerTool(name, config, callback as ToolCallback<Input>);
    },
  };
}

/** Prompt definition passed to {@link definePrompt}. `args` arrive already validated. */
export type PromptDefinition<Args extends StandardSchemaWithJSON> = {
  name: string;
  title?: string;
  description?: string;
  /** Use `z.object({})` for prompts without arguments. */
  argsSchema: Args;
  handler: (
    args: StandardSchemaWithJSON.InferOutput<Args>,
    ctx: ServerContext,
    deps: McpServerFactoryContext,
  ) => MaybePromise<GetPromptResult | InputRequiredResult>;
};

/** A prompt ready to attach to a server instance. */
export type PromptPlugin = {
  name: string;
  register: (server: McpServer, deps: McpServerFactoryContext) => void;
};

/** Wraps a prompt so {@link PromptDefinition.handler} also receives the shared app context. */
export function definePrompt<Args extends StandardSchemaWithJSON>(
  definition: PromptDefinition<Args>,
): PromptPlugin {
  const { name, handler, ...config } = definition;
  return {
    name,
    register(server, deps) {
      const callback = (args: StandardSchemaWithJSON.InferOutput<Args>, ctx: ServerContext) =>
        handler(args, ctx, deps);
      server.registerPrompt(name, config, callback as PromptCallback<Args>);
    },
  };
}

type ResourceResult = MaybePromise<ReadResourceResult | InputRequiredResult>;

/** Resource metadata, plus an optional `resources/read` cache hint for unchanging content. */
export type ResourceConfig = ResourceMetadata & { cacheHint?: CacheHint };

/** Static resource. */
export type ResourcePlugin = {
  type: "resource";
  name: string;
  uri: string;
  config: ResourceConfig;
  readCallback: (uri: URL, ctx: ServerContext, deps: McpServerFactoryContext) => ResourceResult;
};

/** Resource template. */
export type ResourceTemplatePlugin = {
  type: "template";
  name: string;
  template: ResourceTemplate;
  config: ResourceConfig;
  readCallback: (
    uri: URL,
    variables: Variables,
    ctx: ServerContext,
    deps: McpServerFactoryContext,
  ) => ResourceResult;
};

export type AnyResourcePlugin = ResourcePlugin | ResourceTemplatePlugin;

/** Attaches a resource or template to a server instance. */
export function registerResource(
  server: McpServer,
  resource: AnyResourcePlugin,
  deps: McpServerFactoryContext,
): void {
  if (resource.type === "template") {
    const { name, template, config, readCallback } = resource;
    server.registerResource(
      name,
      template,
      config,
      (uri, variables, ctx) => readCallback(uri, variables, ctx, deps),
    );
    return;
  }
  const { name, uri, config, readCallback } = resource;
  server.registerResource(name, uri, config, (url, ctx) => readCallback(url, ctx, deps));
}
