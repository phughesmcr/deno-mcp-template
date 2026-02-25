/**
 * @description Tools: Functions that can be called by the LLM (with user approval)
 * @see {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod/v3";

import type { ToolModule, ToolPlugin } from "$/shared/types.ts";
import collectUserInfo from "./collectUserInfo.ts";
import { registerDelayedEchoTask } from "./delayedEchoTask.ts";
import domain from "./domain.ts";
import incrementCounter from "./incrementCounter.ts";
import logMessage from "./logMessage.ts";
import notifyListChanged from "./notifyListChanged.ts";
import poem from "./poem.ts";

// deno-lint-ignore no-explicit-any
export const tools: ToolModule<any>[] = [
  collectUserInfo, // Elicitation tool
  domain, // Async tool with external API call
  incrementCounter, // Resource updates + subscriptions
  logMessage, // Logging notification example
  notifyListChanged, // List-changed notification example
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
    this.#tools.set(tool[0], plugin);
  }
}

// WARNING: Task tools use experimental MCP APIs and may change without notice.
export function registerTaskTools(mcp: McpServer): void {
  registerDelayedEchoTask(mcp);
}
