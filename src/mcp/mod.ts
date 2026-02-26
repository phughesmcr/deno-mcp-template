import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { SERVER_CAPABILITIES, SERVER_INFO } from "$/shared/constants.ts";
import { prompts } from "./prompts/mod.ts";
import { resources } from "./resources/mod.ts";
import { createResourceSubscriptionTracker } from "./resources/subscriptionTracker.ts";
import { KvTaskStore } from "./tasks/mod.ts";
import { registerTaskTools, ToolManager, tools } from "./tools/mod.ts";

const subscriptions = createResourceSubscriptionTracker();

/** Check if a URI is subscribed */
export function isSubscribed(uri: string): boolean {
  return subscriptions.isSubscribed(uri);
}

/** Get all subscribed URIs */
export function getSubscriptions(): string[] {
  return subscriptions.getSubscriptions();
}

/**
 * Creates a new MCP server and initializes the request handlers
 * @returns The configured MCP server instance
 */
export function createMcpServer(): McpServer {
  // You can edit the server capabilities in `src/constants.ts`
  const server = new McpServer(SERVER_INFO, {
    capabilities: SERVER_CAPABILITIES,
    taskStore: new KvTaskStore(),
  });
  const notifyForServer = (uri: string): Promise<void> =>
    server.server.sendResourceUpdated({ uri });
  let isNotifierReleased = false;
  const releaseNotifier = async (): Promise<void> => {
    if (isNotifierReleased) return;
    isNotifierReleased = true;
    await subscriptions.unregister(notifyForServer);
  };
  const previousOnClose = server.server.onclose;
  server.server.onclose = () => {
    previousOnClose?.();
    void releaseNotifier().catch((error) => {
      console.error("Failed to clean up subscriptions for closed MCP server", error);
    });
  };

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
      server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
        const uri = request.params.uri;
        await subscriptions.subscribe(notifyForServer, uri);
        return {};
      });

      server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
        const uri = request.params.uri;
        await subscriptions.unsubscribe(notifyForServer, uri);
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
