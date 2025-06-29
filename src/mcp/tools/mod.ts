/**
 * @description Tools: Functions that can be called by the LLM (with user approval)
 * @see {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import type { CallToolRequest } from "@vendor/schema";
import type { ToolModule } from "../../types.ts";
import type {
  Deletion,
  Entity,
  Observation,
  Relation,
} from "./knowledgeGraph/knowledgeGraphManager.ts";
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

export const handleListToolsRequest = async () => ({
  tools: tools.flatMap((tool) => tool.tools),
});

export const handleCallToolRequest = async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case "create_entities":
      return knowledgeGraph.methods.createEntities(args["entities"] as Entity[]);
    case "create_relations":
      return knowledgeGraph.methods.createRelations(args["relations"] as Relation[]);
    case "add_observations":
      return knowledgeGraph.methods.addObservations(args["observations"] as Observation[]);
    case "delete_entities":
      return knowledgeGraph.methods.deleteEntities(args["entityNames"] as string[]);
    case "delete_observations":
      return knowledgeGraph.methods.deleteObservations(args["deletions"] as Deletion[]);
    case "delete_relations":
      return knowledgeGraph.methods.deleteRelations(args["relations"] as Relation[]);
    case "read_graph":
      return knowledgeGraph.methods.readGraph();
    case "search_nodes":
      return knowledgeGraph.methods.searchNodes(args["query"] as string);
    case "open_nodes":
      return knowledgeGraph.methods.openNodes(args["names"] as string[]);
    // ... more tools ...
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};
