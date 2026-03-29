import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { registerFetchWebsiteInfoApp } from "./apps/fetchWebsiteInfoApp.ts";
import type { McpServerFactoryContext } from "./context.ts";
import { mcpServerDefinition, SERVER_CAPABILITIES, SERVER_INFO } from "./serverDefinition.ts";
import { KvTaskMessageQueue, KvTaskStore } from "./tasks/mod.ts";
import { registerTaskTools, ToolManager } from "./tools/mod.ts";
import { registerUrlElicitationDemoTool } from "./tools/urlElicitationDemo.ts";

/**
 * Creates a new MCP server and initializes the request handlers.
 * @param ctx - App-scoped context; reuse the same `subscriptions` for every instance in one process.
 */
export function createMcpServer(ctx: McpServerFactoryContext): McpServer {
  const { subscriptions } = ctx;
  const def = mcpServerDefinition;

  const server = new McpServer(SERVER_INFO, {
    capabilities: SERVER_CAPABILITIES,
    taskStore: new KvTaskStore({ maxTtlMs: ctx.tasks.maxTtlMs }),
    taskMessageQueue: new KvTaskMessageQueue(),
  });
  function notifyForServer(uri: string): Promise<void> {
    return server.server.sendResourceUpdated({ uri });
  }
  let isNotifierReleased = false;
  async function releaseNotifier(): Promise<void> {
    if (isNotifierReleased) return;
    isNotifierReleased = true;
    await subscriptions.unregister(notifyForServer);
  }
  const previousOnClose = server.server.onclose;
  server.server.onclose = function onMcpServerClose(): void {
    previousOnClose?.();
    void releaseNotifier().catch(function onReleaseNotifierError(error: unknown): void {
      console.error("Failed to clean up subscriptions for closed MCP server", error);
    });
  };

  if (def.prompts.length > 0) {
    for (const prompt of def.prompts) {
      server.registerPrompt(...prompt);
    }
  }

  if (def.resources.length > 0) {
    for (const resource of def.resources) {
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

    if (def.resourceSubscribe) {
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

  if (def.tools.length > 0) {
    if (def.fetchWebsiteInfoApp) {
      registerFetchWebsiteInfoApp(server);
    }
    const toolManager = new ToolManager(server);
    for (const tool of def.tools) {
      toolManager.addTool(tool);
    }
  }

  if (def.tasksEnabled) {
    registerTaskTools(server);
  }

  if (def.urlElicitationDemo) {
    registerUrlElicitationDemoTool(server, ctx);
  }

  return server;
}

export {
  createResourceSubscriptionTracker,
  type CreateTransportScopedMcpServer,
  type McpServerFactoryContext,
  type ResourceSubscriptionTracker,
} from "./context.ts";

export {
  buildServerCapabilities,
  type DeclaredServerCapabilities,
  MCP_APPS_EXTENSION_ID,
  type McpServerDefinition,
  mcpServerDefinition,
} from "./serverDefinition.ts";
