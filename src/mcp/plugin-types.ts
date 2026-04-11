/**
 * @description MCP feature registration types (tools, prompts, resources). Import from here in new tools, prompts, and resources.
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
