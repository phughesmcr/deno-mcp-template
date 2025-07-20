/**
 * @description A barrel file for exporting the knowledge graph tool cleanly
 * @see         {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod/v4";

import { createValidationMiddleware, safeToolCall } from "$/mcp/middleware.ts";
import type { ToolModule } from "$/shared/types.ts";
import { KnowledgeGraphManager } from "./knowledgeGraphManager.ts";
import { knowledgeGraphMethodsFactory } from "./methods.ts";
import { InputSanitizer } from "./sanitization.ts";
import {
  AddObservationsArgsSchema,
  CreateEntitiesArgsSchema,
  CreateRelationsArgsSchema,
  DeleteEntitiesArgsSchema,
  DeleteObservationsArgsSchema,
  DeleteRelationsArgsSchema,
  OpenNodesArgsSchema,
  SearchNodesArgsSchema,
} from "./schemas.ts";

const name = "knowledge_graph";

// The knowledge graph MCP tool methods (depends on Deno KV)
const methods = await (async (): Promise<ReturnType<typeof knowledgeGraphMethodsFactory>> => {
  try {
    const kv = await Deno.openKv();

    globalThis.addEventListener("beforeunload", (): void => {
      try {
        kv.close();
      } catch {
        // Ignore errors
      }
    });

    const graph = new KnowledgeGraphManager(kv);
    return knowledgeGraphMethodsFactory(graph);
  } catch {
    return {} as unknown as typeof methods;
  }
})();

// Create validators
const validateCreateEntities = createValidationMiddleware(CreateEntitiesArgsSchema);
const validateCreateRelations = createValidationMiddleware(CreateRelationsArgsSchema);
const validateAddObservations = createValidationMiddleware(AddObservationsArgsSchema);
const validateDeleteEntities = createValidationMiddleware(DeleteEntitiesArgsSchema);
const validateDeleteObservations = createValidationMiddleware(DeleteObservationsArgsSchema);
const validateDeleteRelations = createValidationMiddleware(DeleteRelationsArgsSchema);
const validateSearchNodes = createValidationMiddleware(SearchNodesArgsSchema);
const validateOpenNodes = createValidationMiddleware(OpenNodesArgsSchema);

// Type aliases for validated arguments
export type CreateEntitiesArgs = z.infer<typeof CreateEntitiesArgsSchema>;
export type CreateRelationsArgs = z.infer<typeof CreateRelationsArgsSchema>;
export type AddObservationsArgs = z.infer<typeof AddObservationsArgsSchema>;
export type DeleteEntitiesArgs = z.infer<typeof DeleteEntitiesArgsSchema>;
export type DeleteObservationsArgs = z.infer<typeof DeleteObservationsArgsSchema>;
export type DeleteRelationsArgs = z.infer<typeof DeleteRelationsArgsSchema>;
export type SearchNodesArgs = z.infer<typeof SearchNodesArgsSchema>;
export type OpenNodesArgs = z.infer<typeof OpenNodesArgsSchema>;

// The knowledge graph MCP tool request router
const request = (name: string, args: Record<string, unknown>): Promise<CallToolResult> => {
  switch (name) {
    case "create_entities":
      return safeToolCall(
        validateCreateEntities,
        async (validatedArgs) => {
          // Sanitize entity names and observations
          const sanitizedEntities = validatedArgs.entities.map((entity) => ({
            ...entity,
            name: InputSanitizer.sanitizeEntityName(entity.name),
            entityType: InputSanitizer.sanitizeEntityName(entity.entityType),
            observations: entity.observations.map((obs) => InputSanitizer.sanitizeObservation(obs)),
          }));

          return methods.createEntities(sanitizedEntities);
        },
      )(args);

    case "create_relations":
      return safeToolCall(
        validateCreateRelations,
        async (validatedArgs) => {
          const sanitizedRelations = validatedArgs.relations.map((relation) => ({
            ...relation,
            from: InputSanitizer.sanitizeEntityName(relation.from),
            to: InputSanitizer.sanitizeEntityName(relation.to),
            relationType: InputSanitizer.sanitizeEntityName(relation.relationType),
          }));

          return methods.createRelations(sanitizedRelations);
        },
      )(args);

    case "add_observations":
      return safeToolCall(
        validateAddObservations,
        async (validatedArgs) => {
          const sanitizedObservations = validatedArgs.observations.map((obs) => ({
            ...obs,
            entityName: InputSanitizer.sanitizeEntityName(obs.entityName),
            contents: obs.contents.map((content) => InputSanitizer.sanitizeObservation(content)),
          }));

          return methods.addObservations(sanitizedObservations);
        },
      )(args);

    case "delete_entities":
      return safeToolCall(
        validateDeleteEntities,
        async (validatedArgs) => {
          const sanitizedNames = validatedArgs.entityNames.map((name) =>
            InputSanitizer.sanitizeEntityName(name)
          );

          return methods.deleteEntities(sanitizedNames);
        },
      )(args);

    case "delete_observations":
      return safeToolCall(
        validateDeleteObservations,
        async (validatedArgs) => {
          const sanitizedDeletions = validatedArgs.deletions.map((deletion) => ({
            ...deletion,
            entityName: InputSanitizer.sanitizeEntityName(deletion.entityName),
            observations: deletion.observations.map((obs) =>
              InputSanitizer.sanitizeObservation(obs)
            ),
          }));

          return methods.deleteObservations(sanitizedDeletions);
        },
      )(args);

    case "delete_relations":
      return safeToolCall(
        validateDeleteRelations,
        async (validatedArgs) => {
          const sanitizedRelations = validatedArgs.relations.map((relation) => ({
            ...relation,
            from: InputSanitizer.sanitizeEntityName(relation.from),
            to: InputSanitizer.sanitizeEntityName(relation.to),
            relationType: InputSanitizer.sanitizeEntityName(relation.relationType),
          }));

          return methods.deleteRelations(sanitizedRelations);
        },
      )(args);

    case "read_graph":
      return methods.readGraph();

    case "search_nodes":
      return safeToolCall(
        validateSearchNodes,
        async (validatedArgs) => {
          const sanitizedQuery = InputSanitizer.sanitizeSearchQuery(validatedArgs.query);
          return methods.searchNodes(sanitizedQuery);
        },
      )(args);

    case "open_nodes":
      return safeToolCall(
        validateOpenNodes,
        async (validatedArgs) => {
          const sanitizedNames = validatedArgs.names.map((name) =>
            InputSanitizer.sanitizeEntityName(name)
          );

          return methods.openNodes(sanitizedNames);
        },
      )(args);

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
