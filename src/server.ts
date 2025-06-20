/**
 * @description An implementation of the example Memory Server using Deno KV
 * @see {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { APP_NAME, APP_VERSION } from "./constants.ts";
import {
  type Deletion,
  type Entity,
  knowledgeGraph,
  knowledgeGraphToolSchema,
  type Observation,
  type Relation,
} from "./tools/mod.ts";

/** Creates a new MCP server and initializes the request handlers */
export function createMcpServer(): Server {
  const server = new Server({
    name: APP_NAME,
    version: APP_VERSION,
  }, {
    capabilities: {
      tools: {},
      logging: {},
    },
  });

  // Return the list of tools when requested
  server.setRequestHandler(
    ListToolsRequestSchema,
    async () => ({ tools: knowledgeGraphToolSchema }),
    // ...[knowledgeGraphToolSchema, ...otherToolSchemas] if you have more tools
  );

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error(`No arguments provided for tool: ${name}`);
    }

    switch (name) {
      case "create_entities":
        return await knowledgeGraph.createEntities(args["entities"] as Entity[]);
      case "create_relations":
        return await knowledgeGraph.createRelations(args["relations"] as Relation[]);
      case "add_observations":
        return await knowledgeGraph.addObservations(args["observations"] as Observation[]);
      case "delete_entities":
        return await knowledgeGraph.deleteEntities(args["entityNames"] as string[]);
      case "delete_observations":
        return await knowledgeGraph.deleteObservations(args["deletions"] as Deletion[]);
      case "delete_relations":
        return await knowledgeGraph.deleteRelations(args["relations"] as Relation[]);
      case "read_graph":
        return await knowledgeGraph.readGraph();
      case "search_nodes":
        return await knowledgeGraph.searchNodes(args["query"] as string);
      case "open_nodes":
        return await knowledgeGraph.openNodes(args["names"] as string[]);
      // ... more tools ...
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Return the MCP server
  return server;
}
