/**
 * @description Tools: Functions that can be called by the LLM (with user approval)
 * @see {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import type { CallToolRequest } from "@vendor/schema";
import type { ToolModule } from "../../types.ts";
import { knowledgeGraph } from "./knowledgeGraph/mod.ts";

// deno-lint-ignore no-explicit-any
const tools: ToolModule<any>[] = [
  knowledgeGraph,
  // ... more tools
];

// If Deno KV failed to open, the knowledge graph tool is removed from the list of tools
if (Object.keys(knowledgeGraph.methods).length === 0) {
  console.error("Knowledge graph methods are not available. Tool disabled.");
  tools.splice(tools.findIndex((tool) => tool.name === knowledgeGraph.name), 1);
}

export const listTools = async () => ({
  tools: tools.flatMap((tool) => tool.tools),
});

export const callTool = async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;
  if (!args) throw new Error(`No arguments provided for tool: ${name}`);
  const module = tools.find((tool) => tool.tools.find((t) => t.name === name));
  if (!module) throw new Error(`Unknown tool: ${name}`);
  return module.request(name, args);
};
