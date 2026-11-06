import type { McpServerDefinition } from "$/mcp/mod.ts";
import { buildServerCapabilities, MCP_APPS_EXTENSION_ID } from "$/mcp/mod.ts";
import { defineTool } from "$/mcp/plugin-types.ts";
import helloWorld from "$/mcp/resources/helloWorld.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";
import { z } from "zod";

import { assert, assertEquals } from "./helpers.ts";
import { createTestMcpHandler, mcpRequest } from "./mcpHttp.ts";

const echoTool = defineTool({
  name: "assembly-echo",
  inputSchema: z.object({}),
  handler: (_args, _ctx, deps) => createCallToolTextResponse({ hasKv: deps.kv !== undefined }),
});

function minimalDefinition(overrides: Partial<McpServerDefinition> = {}): McpServerDefinition {
  return {
    prompts: [],
    resources: [helloWorld],
    tools: [echoTool],
    resourceSubscribe: true,
    apps: [],
    urlElicitation: false,
    ...overrides,
  };
}

Deno.test("buildServerCapabilities advertises subscribe and MCP Apps only when enabled", () => {
  const on = buildServerCapabilities(
    minimalDefinition({
      resourceSubscribe: true,
      apps: [{ name: "stub-app", register: () => {} }],
    }),
  );
  assertEquals(on.resources?.subscribe, true);
  assert(on.extensions?.[MCP_APPS_EXTENSION_ID] !== undefined, "expected MCP Apps extension");

  const off = buildServerCapabilities(minimalDefinition({ resourceSubscribe: false }));
  assertEquals(off.resources?.subscribe, undefined);
  assertEquals(off.extensions?.[MCP_APPS_EXTENSION_ID], undefined);
});

Deno.test({
  name: "createMcpServer registers exactly the definition's tools and resources",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const handler = createTestMcpHandler(minimalDefinition());

    const tools = await (await handler.fetch(mcpRequest("tools/list"))).json() as {
      result?: { tools: { name: string }[] };
    };
    assertEquals(tools.result?.tools.map((t) => t.name).join(","), "assembly-echo");

    const resources = await (await handler.fetch(mcpRequest("resources/list"))).json() as {
      result?: { resources: { uri: string }[] };
    };
    assertEquals(resources.result?.resources.length, 1);

    const call = await (await handler.fetch(
      mcpRequest("tools/call", { name: "assembly-echo", arguments: {} }, { name: "assembly-echo" }),
    )).json() as { result?: { content: { text: string }[] } };
    assert(
      call.result?.content[0]?.text.includes('"hasKv":true') === true,
      "tool handler should receive the shared factory context",
    );
  },
});
