/**
 * @description A barrel file for exporting the knowledge graph tool cleanly
 * @see         {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import type { Tool } from "@vendor/schema";
import { KV } from "../../../constants.ts";
import type { ToolModule } from "../../../types.ts";
import { KnowledgeGraphManager } from "./knowledgeGraphManager.ts";
import { knowledgeGraphMethodsFactory } from "./methods.ts";

// The knowledge graph MCP tool methods
const methods = await (async (): Promise<ReturnType<typeof knowledgeGraphMethodsFactory>> => {
  try {
    const kv = await Deno.openKv();
    return knowledgeGraphMethodsFactory(new KnowledgeGraphManager(kv));
  } catch (error) {
    console.error("Error opening KV store:", error);
    return {} as unknown as typeof methods;
  }
})();

// The list of tools that can be used by the LLM
const tools: Tool[] = [
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
    description: "Delete multiple entities and their associated relations from the knowledge graph",
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
];

export const knowledgeGraph = { methods, tools } as ToolModule<typeof methods>;
export type { KnowledgeGraphManager };
