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

import { SERVER_CAPABILITIES, SERVER_INFO } from "$/constants";
import { getPrompt, listPrompts } from "./prompts/mod.ts";
import { listResources, listResourceTemplates, readResource } from "./resources/mod.ts";
import { callTool, listTools } from "./tools/mod.ts";

/** Creates a new MCP server and initializes the request handlers */
export function createMcpServer(): Server {
  // You can edit the server capabilities in `src/constants.ts`
  const server = new Server(SERVER_INFO, { capabilities: SERVER_CAPABILITIES });

  // Prompt handlers
  if ("prompts" in SERVER_CAPABILITIES) {
    server.setRequestHandler(ListPromptsRequestSchema, listPrompts);
    server.setRequestHandler(GetPromptRequestSchema, getPrompt);
  }

  // Resource handlers
  if ("resources" in SERVER_CAPABILITIES) {
    server.setRequestHandler(ListResourceTemplatesRequestSchema, listResourceTemplates);
    server.setRequestHandler(ListResourcesRequestSchema, listResources);
    server.setRequestHandler(ReadResourceRequestSchema, readResource);
  }

  // Tool handlers
  if ("tools" in SERVER_CAPABILITIES) {
    server.setRequestHandler(ListToolsRequestSchema, listTools);
    server.setRequestHandler(CallToolRequestSchema, callTool);
  }

  return server;
}
