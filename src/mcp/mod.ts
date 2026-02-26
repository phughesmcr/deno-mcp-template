import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { createKvWatcher } from "$/app/kv/mod.ts";
import { SERVER_CAPABILITIES, SERVER_INFO } from "$/shared/constants.ts";
import { prompts } from "./prompts/mod.ts";
import { RESOURCE_KV_KEYS } from "./resources/kvKeys.ts";
import { resources } from "./resources/mod.ts";
import { KvTaskStore } from "./tasks/mod.ts";
import { registerTaskTools, ToolManager, tools } from "./tools/mod.ts";

/** Tracks resource subscriptions by URI */
const subscriptions = new Set<string>();
const watcher = createKvWatcher();
const resourceUpdateNotifiers = new Set<(uri: string) => Promise<void>>();

async function notifyResourceSubscribers(uri: string): Promise<void> {
  if (!resourceUpdateNotifiers.size) return;
  await Promise.allSettled(
    Array.from(resourceUpdateNotifiers, (notify) => notify(uri)),
  );
}

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
    taskStore: new KvTaskStore(),
  });
  const notifyForServer = async (uri: string): Promise<void> => {
    try {
      await server.server.sendResourceUpdated({ uri });
    } catch {
      // Drop stale notifier when the underlying transport is no longer connected.
      resourceUpdateNotifiers.delete(notifyForServer);
    }
  };
  resourceUpdateNotifiers.add(notifyForServer);

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
        const wasSubscribed = subscriptions.has(uri);
        subscriptions.add(uri);
        const key = RESOURCE_KV_KEYS.get(uri);
        if (!wasSubscribed && key) {
          await watcher.watch(uri, key, async () => {
            if (!subscriptions.has(uri)) return;
            await notifyResourceSubscribers(uri);
          });
        }
        return {};
      });

      server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
        const uri = request.params.uri;
        subscriptions.delete(uri);
        await watcher.unwatch(uri);
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
