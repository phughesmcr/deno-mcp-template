import { McpServer } from "@modelcontextprotocol/server";

import { registerFetchWebsiteInfoApp } from "./apps/fetchWebsiteInfoApp.ts";
import type { McpServerFactoryContext } from "./context.ts";
import { registerResource } from "./plugin-types.ts";
import {
  buildServerCapabilities,
  type McpServerDefinition,
  mcpServerDefinition,
  SERVER_INFO,
} from "./serverDefinition.ts";

/**
 * Creates a new MCP server with every feature in the definition registered.
 * @param ctx - Process-wide state; reuse the same object for every instance.
 * @param def - Feature registry override (for tests or profiles).
 */
export function createMcpServer(
  ctx: McpServerFactoryContext,
  def: McpServerDefinition = mcpServerDefinition,
): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: buildServerCapabilities(def),
    requestState: { verify: ctx.requestState.verify },
  });

  for (const prompt of def.prompts) prompt.register(server, ctx);
  for (const resource of def.resources) registerResource(server, resource, ctx);
  for (const tool of def.tools) tool.register(server, ctx);
  if (def.fetchWebsiteInfoApp) registerFetchWebsiteInfoApp(server);

  return server;
}

export type { CreateMcpServer, McpServerFactoryContext } from "./context.ts";

export {
  buildServerCapabilities,
  deriveMcpRuntimeRequirements,
  MCP_APPS_EXTENSION_ID,
  type McpRuntimeRequirements,
  type McpServerDefinition,
  mcpServerDefinition,
} from "./serverDefinition.ts";
