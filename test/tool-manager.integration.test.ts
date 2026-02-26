import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ToolManager } from "$/mcp/tools/mod.ts";
import type { ToolModule } from "$/shared/types.ts";
import { createCallToolTextResponse } from "$/shared/utils.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

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
