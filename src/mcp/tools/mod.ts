/**
 * @description Tools: Functions that can be called by the LLM (with user approval)
 * @see {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod/v3";

import type { ToolModule, ToolPlugin } from "$/shared/types.ts";
import domain from "./domain.ts";
import poem from "./poem.ts";

// deno-lint-ignore no-explicit-any
export const tools: ToolModule<any>[] = [
  domain, // Async tool with external API call
  poem, // Sampling tool
  // ... more tools
];

// Allows for tools to access the MCP server for sampling
export class ToolManager {
  #tools: Map<string, ToolPlugin>;
  #mcp: McpServer;

  constructor(mcp: McpServer) {
    this.#mcp = mcp;
    this.#tools = new Map();
  }

  /** Binds a module to a MCP server, creating a tool plugin */
  #createPlugin<T extends ZodRawShape | undefined>(module: ToolModule<T>): ToolPlugin {
    const [name, config, callback] = module;
    return [name, config, callback(this.#mcp)] as ToolPlugin;
  }

  // deno-lint-ignore no-explicit-any
  addTool(tool: ToolModule<any>) {
    if (this.#tools.has(tool[0])) return;
    const plugin = this.#createPlugin(tool);
    this.#mcp.registerTool(...plugin);
  }
}
