/**
 * Single registry for MCP feature modules, capability flags, and derived `SERVER_CAPABILITIES`.
 * Add or remove features here so registration and advertised capabilities stay aligned.
 * @module
 */

import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types";

import type { AnyResourcePlugin, PromptPlugin, ToolModule } from "$/mcp/plugin-types.ts";
import { APP_NAME, APP_TITLE, APP_VERSION } from "$/shared/constants/app.ts";
import { prompts } from "./prompts/mod.ts";
import { resources } from "./resources/mod.ts";
import { tools } from "./tools/mod.ts";

/** Subset of Deno permissions MCP features may require when HTTP is disabled. */
export type McpRuntimeRequirements = Readonly<{
  net: boolean;
}>;

/**
 * Pure fold over the server definition and tool {@link ToolConfig.runtime} metadata.
 * Declare `runtime.requiresNet` on tools that perform outbound I/O; keep `fetchWebsiteInfoApp`
 * in sync with the fetch-website-info MCP App registration.
 */
export function deriveMcpRuntimeRequirements(def: McpServerDefinition): McpRuntimeRequirements {
  if (def.fetchWebsiteInfoApp) return { net: true };
  const needsNetFromTool = def.tools.some((tool) => tool[1].runtime?.requiresNet === true);
  return { net: needsNetFromTool };
}

/**
 * @deprecated Prefer {@link deriveMcpRuntimeRequirements}; kept for a stable import path.
 */
export function mcpRuntimeRequiresNet(def: McpServerDefinition): boolean {
  return deriveMcpRuntimeRequirements(def).net;
}

/**
 * MCP Apps extension id
 * ({@link https://modelcontextprotocol.io/extensions/overview#negotiation}).
 */
export const MCP_APPS_EXTENSION_ID = "io.modelcontextprotocol/ui";

/** Capabilities shape advertised by this template (includes `extensions` for MCP Apps). */
export type DeclaredServerCapabilities = ServerCapabilities & {
  extensions: Record<string, Record<string, unknown>>;
};

export interface McpServerDefinition {
  readonly prompts: readonly PromptPlugin[];
  readonly resources: readonly AnyResourcePlugin[];
  // deno-lint-ignore no-explicit-any
  readonly tools: readonly ToolModule<any>[];
  readonly promptsListChanged: boolean;
  readonly resourceListChanged: boolean;
  readonly resourceSubscribe: boolean;
  readonly toolsListChanged: boolean;
  readonly tasksEnabled: boolean;
  readonly experimentalElicitation: boolean;
  readonly mcpAppsExtension: boolean;
  /** Registers the fetch-website-info MCP App (requires tools + extension). */
  readonly fetchWebsiteInfoApp: boolean;
  /** Registers `url-elicitation-demo` (URL-mode elicitation; requires HTTP). */
  readonly urlElicitationDemo: boolean;
}

/**
 * Default template features and flags. Adjust booleans when you change listChanged / subscribe /
 * tasks / elicitation / MCP Apps behavior.
 */
export const mcpServerDefinition: McpServerDefinition = {
  prompts,
  resources,
  tools,
  promptsListChanged: true,
  resourceListChanged: true,
  resourceSubscribe: true,
  toolsListChanged: true,
  tasksEnabled: true,
  experimentalElicitation: true,
  mcpAppsExtension: true,
  fetchWebsiteInfoApp: true,
  urlElicitationDemo: true,
};

/** Builds SDK `ServerCapabilities` from the registry (keeps registration and negotiation in sync). */
export function buildServerCapabilities(def: McpServerDefinition): DeclaredServerCapabilities {
  const capabilities: DeclaredServerCapabilities = {
    completions: {},
    logging: {},
    extensions: {},
  };

  if (def.prompts.length > 0) {
    capabilities.prompts = { listChanged: def.promptsListChanged };
  }

  if (def.resources.length > 0) {
    capabilities.resources = {
      listChanged: def.resourceListChanged,
      ...(def.resourceSubscribe ? { subscribe: true as const } : {}),
    };
  }

  if (def.tools.length > 0) {
    capabilities.tools = { listChanged: def.toolsListChanged };
  }

  if (def.tasksEnabled) {
    capabilities.tasks = {
      list: {},
      cancel: {},
      requests: {
        tools: {
          call: {},
        },
      },
    };
  }

  if (def.experimentalElicitation) {
    capabilities.experimental = { elicitation: {} };
  }

  if (def.mcpAppsExtension) {
    capabilities.extensions = {
      [MCP_APPS_EXTENSION_ID]: {},
    };
  }

  return capabilities;
}

export const SERVER_CAPABILITIES = buildServerCapabilities(mcpServerDefinition);

export const SERVER_INFO = {
  name: APP_NAME,
  title: APP_TITLE,
  version: APP_VERSION,
} as const;
