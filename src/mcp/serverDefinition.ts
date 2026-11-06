/**
 * Single registry for MCP feature modules and the capabilities they need declared.
 * Add or remove features here so registration and advertised capabilities stay aligned.
 * @module
 */

import type { ServerCapabilities } from "@modelcontextprotocol/server";

import type { AnyResourcePlugin, PromptPlugin, ToolPlugin } from "$/mcp/plugin-types.ts";
import { APP_NAME, APP_TITLE, APP_VERSION } from "$/shared/constants/app.ts";
import { prompts } from "./prompts/mod.ts";
import { resources } from "./resources/mod.ts";
import { tools } from "./tools/mod.ts";

/** Subset of Deno permissions MCP features may require when HTTP is disabled. */
export type McpRuntimeRequirements = Readonly<{
  net: boolean;
}>;

/**
 * Pure fold over the server definition and tool `runtime` metadata.
 * Declare `runtime.requiresNet` on tools that perform outbound I/O; keep `fetchWebsiteInfoApp`
 * in sync with the fetch-website-info MCP App registration.
 */
export function deriveMcpRuntimeRequirements(def: McpServerDefinition): McpRuntimeRequirements {
  const net = def.fetchWebsiteInfoApp ||
    def.tools.some((tool) => tool.runtime?.requiresNet === true);
  return { net };
}

/**
 * MCP Apps extension id
 * ({@link https://modelcontextprotocol.io/extensions/overview#negotiation}).
 */
export const MCP_APPS_EXTENSION_ID = "io.modelcontextprotocol/ui";

export interface McpServerDefinition {
  readonly prompts: readonly PromptPlugin[];
  readonly resources: readonly AnyResourcePlugin[];
  readonly tools: readonly ToolPlugin[];
  /** Advertise `resources.subscribe`, which gates `notifications/resources/updated`. */
  readonly resourceSubscribe: boolean;
  readonly mcpAppsExtension: boolean;
  /** Registers the fetch-website-info MCP App (requires the extension). */
  readonly fetchWebsiteInfoApp: boolean;
}

/** Default template features. Adjust the flags when you change subscribe or MCP Apps behavior. */
export const mcpServerDefinition: McpServerDefinition = {
  prompts,
  resources,
  tools,
  resourceSubscribe: true,
  mcpAppsExtension: true,
  fetchWebsiteInfoApp: true,
};

/**
 * Capabilities the SDK cannot infer. `McpServer` adds `tools`, `prompts`, `resources` (with
 * `listChanged`) and `completions` itself as features register.
 */
export function buildServerCapabilities(def: McpServerDefinition): ServerCapabilities {
  return {
    logging: {},
    ...(def.resourceSubscribe ? { resources: { subscribe: true } } : {}),
    ...(def.mcpAppsExtension ? { extensions: { [MCP_APPS_EXTENSION_ID]: {} } } : {}),
  };
}

export const SERVER_INFO = {
  name: APP_NAME,
  title: APP_TITLE,
  version: APP_VERSION,
} as const;
