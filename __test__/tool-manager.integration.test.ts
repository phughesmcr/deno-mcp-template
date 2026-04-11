import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ToolModule } from "$/mcp/plugin-types.ts";
import { ToolManager } from "$/mcp/tools/mod.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";
import { assertEquals } from "./helpers.ts";

Deno.test("ToolManager registers a tool only once by name", () => {
  let registrations = 0;

  const fakeMcp = {
    registerTool: () => {
      registrations += 1;
    },
  } as unknown as McpServer;

  const manager = new ToolManager(fakeMcp);
  const tool: ToolModule = [
    "test-tool",
    {
      title: "Test tool",
      description: "A test tool",
    },
    () => async () => createCallToolTextResponse({ status: "ok" }),
  ];

  manager.addTool(tool);
  manager.addTool(tool);

  assertEquals(registrations, 1);
});
