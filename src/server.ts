/**
 * @description An implementation of the example Memory Server using Deno KV
 * @see {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
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
  handleCallToolRequest,
  handleGetPromptsRequest,
  handleListPromptsRequest,
  handleListResourcesRequest,
  handleListResourceTemplatesRequest,
  handleListToolsRequest,
  handleReadResourceRequest,
} from "./mcp/mod.ts";

/** Creates a new MCP server and initializes the request handlers */
export function createMcpServer(): Server {
  // You can edit the server capabilities in `src/constants.ts`
  const server = new Server(SERVER_INFO, SERVER_CAPABILITIES);

  // Resource handlers
  server.setRequestHandler(ListResourceTemplatesRequestSchema, handleListResourceTemplatesRequest);
  server.setRequestHandler(ListResourcesRequestSchema, handleListResourcesRequest);
  server.setRequestHandler(ReadResourceRequestSchema, handleReadResourceRequest);

  // Tool handlers
  server.setRequestHandler(ListToolsRequestSchema, handleListToolsRequest);
  server.setRequestHandler(CallToolRequestSchema, handleCallToolRequest);

  // Prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, handleListPromptsRequest);
  server.setRequestHandler(GetPromptRequestSchema, handleGetPromptsRequest);

  return server;
}
