import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { SERVER_CAPABILITIES, SERVER_INFO } from "$/shared/constants.ts";
import { prompts } from "./prompts/mod.ts";
import { resources } from "./resources/mod.ts";
import { ToolManager, tools } from "./tools/mod.ts";

/**
 * Creates a new MCP server and initializes the request handlers
 * @returns The configured MCP server instance
 */
export function createMcpServer(): McpServer {
  // You can edit the server capabilities in `src/constants.ts`
  const server = new McpServer(SERVER_INFO, { capabilities: SERVER_CAPABILITIES });

  // Prompt handlers
  if ("prompts" in SERVER_CAPABILITIES) {
    for (const prompt of prompts) {
      server.registerPrompt(...prompt);
    }
  }

  // Resource handlers
  if ("resources" in SERVER_CAPABILITIES) {
    for (const resource of resources) {
      server.registerResource(
        ...(resource as unknown as Parameters<McpServer["registerResource"]>),
      );
    }
  }

  // Tool handlers
  if ("tools" in SERVER_CAPABILITIES) {
    const toolManager = new ToolManager(server);
    for (const tool of tools) {
      toolManager.addTool(tool);
    }
  }

  return server;
}
