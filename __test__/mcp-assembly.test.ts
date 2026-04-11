import {
  createMcpServer,
  createResourceSubscriptionTracker,
  type McpServerDefinition,
  type McpServerFactoryContext,
  type ResourceSubscriptionTracker,
} from "$/mcp/mod.ts";
import helloWorld from "$/mcp/resources/helloWorld.ts";
import { KvTaskMessageQueue, KvTaskStore } from "$/mcp/tasks/mod.ts";

import { mcpFactoryContext } from "./helpers.ts";

function minimalSubscribeDefinition(): McpServerDefinition {
  return {
    prompts: [],
    resources: [helloWorld],
    tools: [],
    promptsListChanged: false,
    resourceListChanged: false,
    resourceSubscribe: true,
    toolsListChanged: false,
    tasksEnabled: false,
    experimentalElicitation: false,
    mcpAppsExtension: false,
    fetchWebsiteInfoApp: false,
    urlElicitationDemo: false,
  };
}

Deno.test("createMcpServer invokes assembly ports with ctx.tasks.maxTtlMs", () => {
  const subscriptions = createResourceSubscriptionTracker();
  const ctx: McpServerFactoryContext = {
    ...mcpFactoryContext(subscriptions),
    tasks: { maxTtlMs: 42_000 },
  };

  let seenTtl: number | undefined;
  let queues = 0;

  createMcpServer(ctx, {
    definition: minimalSubscribeDefinition(),
    ports: {
      createTaskStore: (args) => {
        seenTtl = args.maxTtlMs;
        return new KvTaskStore({ maxTtlMs: args.maxTtlMs, kv: args.kv });
      },
      createTaskMessageQueue: (args) => {
        queues++;
        return new KvTaskMessageQueue(args.kv);
      },
    },
  });

  if (seenTtl !== 42_000) throw new Error(`expected maxTtlMs 42000, got ${seenTtl}`);
  if (queues !== 1) throw new Error(`expected one queue, got ${queues}`);
});

Deno.test("createMcpServer onclose invokes subscription unregister", async () => {
  const inner = createResourceSubscriptionTracker();
  let unregisterCalls = 0;
  const subscriptions = {
    ...inner,
    unregister: async (notifier: (uri: string) => Promise<void>) => {
      unregisterCalls++;
      await inner.unregister(notifier);
    },
  };

  const ctx: McpServerFactoryContext = mcpFactoryContext(
    subscriptions as unknown as ResourceSubscriptionTracker,
  );
  const server = createMcpServer(ctx, { definition: minimalSubscribeDefinition() });

  const close = server.server.onclose;
  if (!close) throw new Error("expected onclose");
  close.call(server.server);

  await new Promise((r) => setTimeout(r, 0));

  if (unregisterCalls < 1) {
    throw new Error(`expected unregister invoked, got ${unregisterCalls}`);
  }
});
