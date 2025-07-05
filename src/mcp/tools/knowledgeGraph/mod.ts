/**
 * @description A barrel file for exporting the knowledge graph tool cleanly
 * @see         {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import type { CallToolResult, Tool } from "@vendor/schema";
import type { ToolModule } from "../../../types.ts";
import { getGlobal } from "../../../utils.ts";
import { knowledgeGraphMethodsFactory } from "./methods.ts";

const name = "knowledge_graph";

// The knowledge graph MCP tool methods (depends on Deno KV)
const methods = await (async (): Promise<ReturnType<typeof knowledgeGraphMethodsFactory>> => {
  try {
    const kv = await Deno.openKv();

    globalThis.addEventListener("beforeunload", (): void => {
      try {
        kv.close();
      } catch (error) {
        if (!getGlobal("QUIET")) {
        console.error("Error closing KV store:", error);
        }
      }
    });

    const graph = new KnowledgeGraphManager(kv);
    return knowledgeGraphMethodsFactory(graph);
  } catch (error) {
    if (!getGlobal("QUIET")) {
    console.error("Error opening KV store:", error);
    }
    return {} as unknown as typeof methods;
  }
})();

// The knowledge graph MCP tool request router
const request = (name: string, args: Record<string, unknown>): Promise<CallToolResult> => {
  switch (name) {
    case "create_entities":
      return methods.createEntities(args["entities"] as Entity[]);
    case "create_relations":
      return methods.createRelations(args["relations"] as Relation[]);
    case "add_observations":
      return methods.addObservations(args["observations"] as Observation[]);
    case "delete_entities":
      return methods.deleteEntities(args["entityNames"] as string[]);
    case "delete_observations":
      return methods.deleteObservations(args["deletions"] as Deletion[]);
    case "delete_relations":
      return methods.deleteRelations(args["relations"] as Relation[]);
    case "read_graph":
      return methods.readGraph();
    case "search_nodes":
      return methods.searchNodes(args["query"] as string);
    case "open_nodes":
      return methods.openNodes(args["names"] as string[]);
    // ... more tools ...
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

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

export const knowledgeGraph: ToolModule<typeof methods> = { name, methods, tools, request };
export type { KnowledgeGraphManager };
