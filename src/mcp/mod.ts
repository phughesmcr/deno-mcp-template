import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTaskStore } from "@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { SERVER_CAPABILITIES, SERVER_INFO } from "$/shared/constants.ts";
import { prompts } from "./prompts/mod.ts";
import { resources } from "./resources/mod.ts";
import { registerTaskTools, ToolManager, tools } from "./tools/mod.ts";

/** Tracks resource subscriptions by URI */
const subscriptions = new Set<string>();

/** Check if a URI is subscribed */
export function isSubscribed(uri: string): boolean {
  return subscriptions.has(uri);
}

/** Get all subscribed URIs */
export function getSubscriptions(): string[] {
  return Array.from(subscriptions);
}

/**
 * Creates a new MCP server and initializes the request handlers
 * @returns The configured MCP server instance
 */
export function createMcpServer(): McpServer {
  // You can edit the server capabilities in `src/constants.ts`
  const server = new McpServer(SERVER_INFO, {
    capabilities: SERVER_CAPABILITIES,
    taskStore: new InMemoryTaskStore(),
  });

  // Prompt handlers
  if ("prompts" in SERVER_CAPABILITIES) {
    for (const prompt of prompts) {
      server.registerPrompt(...prompt);
    }
  }

  // Resource handlers
  if ("resources" in SERVER_CAPABILITIES) {
    for (const resource of resources) {
      if (resource.type === "template") {
        server.registerResource(
          resource.name,
          resource.template,
          resource.config,
          resource.readCallback,
        );
      } else {
        server.registerResource(
          resource.name,
          resource.uri,
          resource.config,
          resource.readCallback,
        );
      }
    }

    // Resource subscription handlers
    const resourceCapabilities = SERVER_CAPABILITIES.resources;
    if (
      resourceCapabilities && "subscribe" in resourceCapabilities && resourceCapabilities.subscribe
    ) {
      server.server.setRequestHandler(SubscribeRequestSchema, (request) => {
        const uri = request.params.uri;
        subscriptions.add(uri);
        return {};
      });

      server.server.setRequestHandler(UnsubscribeRequestSchema, (request) => {
        const uri = request.params.uri;
        subscriptions.delete(uri);
        return {};
      });
    }
  }

  // Tool handlers
  if ("tools" in SERVER_CAPABILITIES) {
    const toolManager = new ToolManager(server);
    for (const tool of tools) {
      toolManager.addTool(tool);
    }
  }

  // Experimental task-based tool handlers
  if ("tasks" in SERVER_CAPABILITIES) {
    registerTaskTools(server);
  }

  return server;
}
