import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";
import { assert, assertEquals } from "./helpers.ts";
import { mcpFactoryContext } from "./helpers.ts";

Deno.test("defineTool registers under its name and passes deps to the handler", async () => {
  const registered: { name: string; cb: (args: unknown, ctx: unknown) => unknown }[] = [];
  const fakeMcp = {
    registerTool: (
      name: string,
      _config: unknown,
      cb: (args: unknown, ctx: unknown) => unknown,
    ) => {
      registered.push({ name, cb });
    },
  } as unknown as McpServer;

  const deps = mcpFactoryContext();
  let seenDeps: unknown;
  const tool = defineTool({
    name: "test-tool",
    title: "Test tool",
    description: "A test tool",
    inputSchema: z.object({}),
    handler: (_args, _ctx, d) => {
      seenDeps = d;
      return createCallToolTextResponse({ status: "ok" });
    },
  });

  tool.register(fakeMcp, deps);

  assertEquals(registered.length, 1);
  const entry = registered[0];
  assert(entry !== undefined, "tool should be registered");
  assertEquals(entry.name, "test-tool");
  await entry.cb({}, {});
  assertEquals(seenDeps, deps);
});
