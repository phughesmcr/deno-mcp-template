/**
 * @description Factory function for creating an MCP server
 * @module
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { SERVER_CAPABILITIES, SERVER_INFO } from "./constants.ts";
import {
  callTool,
  getPrompt,
  listPrompts,
  listResources,
  listResourceTemplates,
  listTools,
  readResource,
} from "./mcp/mod.ts";

/** Creates a new MCP server and initializes the request handlers */
export function createMcpServer(): Server {
  // You can edit the server capabilities in `src/constants.ts`
  const server = new Server(SERVER_INFO, { capabilities: SERVER_CAPABILITIES });

  // Prompt handlers
  if (SERVER_CAPABILITIES.prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, listPrompts);
    server.setRequestHandler(GetPromptRequestSchema, getPrompt);
  }

  // Resource handlers
  if (SERVER_CAPABILITIES.resources) {
    server.setRequestHandler(ListResourceTemplatesRequestSchema, listResourceTemplates);
    server.setRequestHandler(ListResourcesRequestSchema, listResources);
    server.setRequestHandler(ReadResourceRequestSchema, readResource);
  }

  // Tool handlers
  if (SERVER_CAPABILITIES.tools) {
    server.setRequestHandler(ListToolsRequestSchema, listTools);
    server.setRequestHandler(CallToolRequestSchema, callTool);
  }

  return server;
}
