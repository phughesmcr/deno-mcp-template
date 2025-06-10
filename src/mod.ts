/**
 * @author P. Hughes <github@phugh.es>
 * @description An implementation of the example Memory Server using Deno KV
 * @see {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @license MIT
 * @module
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { APP_NAME, APP_VERSION, KV } from "./constants.ts";
import { KnowledgeGraphManager } from "./knowledgeGraphManager.ts";
import type { Entity, Relation } from "./types.ts";

// The knowledge graph MCP tool
const knowledgeGraphManager = new KnowledgeGraphManager(KV);

// The MCP server
const server = new Server({
  name: APP_NAME,
  version: APP_VERSION,
}, {
  capabilities: {
    tools: {},
    logging: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_entities",
        description: "Create multiple new entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "The name of the entity" },
                  entityType: { type: "string", description: "The type of the entity" },
                  observations: {
                    type: "array",
                    items: { type: "string" },
                    description: "An array of observation contents associated with the entity",
                  },
                },
                required: ["name", "entityType", "observations"],
              },
            },
          },
          required: ["entities"],
        },
      },
      {
        name: "create_relations",
        description:
          "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: {
                    type: "string",
                    description: "The name of the entity where the relation starts",
                  },
                  to: {
                    type: "string",
                    description: "The name of the entity where the relation ends",
                  },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
              },
            },
          },
          required: ["relations"],
        },
      },
      {
        name: "add_observations",
        description: "Add new observations to existing entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            observations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: {
                    type: "string",
                    description: "The name of the entity to add the observations to",
                  },
                  contents: {
                    type: "array",
                    items: { type: "string" },
                    description: "An array of observation contents to add",
                  },
                },
                required: ["entityName", "contents"],
              },
            },
          },
          required: ["observations"],
        },
      },
      {
        name: "delete_entities",
        description:
          "Delete multiple entities and their associated relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entityNames: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to delete",
            },
          },
          required: ["entityNames"],
        },
      },
      {
        name: "delete_observations",
        description: "Delete specific observations from entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            deletions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: {
                    type: "string",
                    description: "The name of the entity containing the observations",
                  },
                  observations: {
                    type: "array",
                    items: { type: "string" },
                    description: "An array of observations to delete",
                  },
                },
                required: ["entityName", "observations"],
              },
            },
          },
          required: ["deletions"],
        },
      },
      {
        name: "delete_relations",
        description: "Delete multiple relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: {
                    type: "string",
                    description: "The name of the entity where the relation starts",
                  },
                  to: {
                    type: "string",
                    description: "The name of the entity where the relation ends",
                  },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
              },
              description: "An array of relations to delete",
            },
          },
          required: ["relations"],
        },
      },
      {
        name: "read_graph",
        description: "Read the entire knowledge graph",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph based on a query",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "The search query to match against entity names, types, and observation content",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "open_nodes",
        description: "Open specific nodes in the knowledge graph by their names",
        inputSchema: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to retrieve",
            },
          },
          required: ["names"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case "create_entities":
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            await knowledgeGraphManager.createEntities(args["entities"] as Entity[]),
            null,
            2,
          ),
        }],
      };
    case "create_relations":
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            await knowledgeGraphManager.createRelations(args["relations"] as Relation[]),
            null,
            2,
          ),
        }],
      };
    case "add_observations":
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            await knowledgeGraphManager.addObservations(
              args["observations"] as { entityName: string; contents: string[] }[],
            ),
            null,
            2,
          ),
        }],
      };
    case "delete_entities":
      await knowledgeGraphManager.deleteEntities(args["entityNames"] as string[]);
      return { content: [{ type: "text", text: "Entities deleted successfully" }] };
    case "delete_observations":
      await knowledgeGraphManager.deleteObservations(
        args["deletions"] as { entityName: string; observations: string[] }[],
      );
      return { content: [{ type: "text", text: "Observations deleted successfully" }] };
    case "delete_relations":
      await knowledgeGraphManager.deleteRelations(args["relations"] as Relation[]);
      return { content: [{ type: "text", text: "Relations deleted successfully" }] };
    case "read_graph":
      return {
        content: [{
          type: "text",
          text: JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2),
        }],
      };
    case "search_nodes":
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            await knowledgeGraphManager.searchNodes(args["query"] as string),
            null,
            2,
          ),
        }],
      };
    case "open_nodes":
      return {
        content: [{
          type: "text",
          text: JSON.stringify(
            await knowledgeGraphManager.openNodes(args["names"] as string[]),
            null,
            2,
          ),
        }],
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

export { server };
