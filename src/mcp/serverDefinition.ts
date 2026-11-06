/**
 * Single registry for MCP feature modules and the capabilities they need declared.
 * Add or remove features here so registration and advertised capabilities stay aligned.
 * @module
 */

import type { ServerCapabilities } from "@modelcontextprotocol/server";

import DenoJson from "../../deno.json" with { type: "json" };
import type { AnyResourcePlugin, AppPlugin, PromptPlugin, ToolPlugin } from "$/mcp/plugin-types.ts";
import { APP_DESCRIPTION, APP_NAME, APP_TITLE, APP_VERSION } from "$/shared/constants/app.ts";
import { apps } from "./apps/mod.ts";
import { prompts } from "./prompts/mod.ts";
import { resources } from "./resources/mod.ts";
import { tools } from "./tools/mod.ts";

/** Subset of Deno permissions MCP features may require when HTTP is disabled. */
export type McpRuntimeRequirements = Readonly<{
  net: boolean;
}>;

/**
 * Pure fold over the server definition and tool and app `runtime` metadata.
 * Declare `runtime.requiresNet` on tools and apps that perform outbound I/O.
 */
export function deriveMcpRuntimeRequirements(def: McpServerDefinition): McpRuntimeRequirements {
  const net = [...def.tools, ...def.apps].some((plugin) => plugin.runtime?.requiresNet === true);
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
  /** Any app also advertises the MCP Apps extension. */
  readonly apps: readonly AppPlugin[];
  /** Mounts the `/mcp-elicitation/*` browser pages. Tools using URL-mode elicitation need it. */
  readonly urlElicitation: boolean;
}

/** Default template features. */
export const mcpServerDefinition: McpServerDefinition = {
  prompts,
  resources,
  tools,
  resourceSubscribe: true,
  apps,
  urlElicitation: true,
};

/**
 * Capabilities the SDK cannot infer. `McpServer` adds `tools`, `prompts`, `resources` (with
 * `listChanged`) and `completions` itself as features register.
 */
export function buildServerCapabilities(def: McpServerDefinition): ServerCapabilities {
  return {
    // Logging is deprecated by SEP-2577, still in the spec for at least twelve months.
    logging: {},
    ...(def.resourceSubscribe ? { resources: { subscribe: true } } : {}),
    ...(def.apps.length > 0 ? { extensions: { [MCP_APPS_EXTENSION_ID]: {} } } : {}),
  };
}

export const SERVER_INFO = {
  name: APP_NAME,
  title: APP_TITLE,
  version: APP_VERSION,
  websiteUrl: DenoJson.homepage,
} as const;

/** Shown to the client's model. Replace with guidance on when to use your own tools. */
export const SERVER_INSTRUCTIONS = `${APP_DESCRIPTION} ` +
  "The server keeps no session, so give each call everything it needs in its arguments.";
