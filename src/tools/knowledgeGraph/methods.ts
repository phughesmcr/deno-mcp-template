/**
 * @description An interface between the knowledge graph manager and the MCP server
 * @module
 */

import type { CallToolResult } from "@vendor/schema";
import { KnowledgeGraphManager } from "./knowledgeGraphManager.ts";
import type { Deletion, Entity, Observation, Relation } from "./types.ts";

// deno-lint-ignore no-explicit-any
const createResponse = (obj: any): CallToolResult => {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(obj, null, 2),
    }],
  };
};

async function createEntities(
  graph: KnowledgeGraphManager,
  entities: Entity[],
): Promise<CallToolResult> {
  const createdEntities = await graph.createEntities(entities);
  return createResponse(createdEntities);
}

async function createRelations(
  graph: KnowledgeGraphManager,
  relations: Relation[],
): Promise<CallToolResult> {
  const createdRelations = await graph.createRelations(relations);
  return createResponse(createdRelations);
}

async function addObservations(
  graph: KnowledgeGraphManager,
  observations: Observation[],
): Promise<CallToolResult> {
  const addedObservations = await graph.addObservations(observations);
  return createResponse(addedObservations);
}

async function deleteEntities(
  graph: KnowledgeGraphManager,
  entityNames: string[],
): Promise<CallToolResult> {
  await graph.deleteEntities(entityNames);
  return createResponse("Entities deleted successfully");
}

async function deleteObservations(
  graph: KnowledgeGraphManager,
  deletions: Deletion[],
): Promise<CallToolResult> {
  await graph.deleteObservations(deletions);
  return createResponse("Observations deleted successfully");
}

async function deleteRelations(
  graph: KnowledgeGraphManager,
  relations: Relation[],
): Promise<CallToolResult> {
  await graph.deleteRelations(relations);
  return createResponse("Relations deleted successfully");
}

async function readGraph(graph: KnowledgeGraphManager): Promise<CallToolResult> {
  const response = await graph.readGraph();
  return createResponse(response);
}

async function searchNodes(graph: KnowledgeGraphManager, query: string): Promise<CallToolResult> {
  const response = await graph.searchNodes(query);
  return createResponse(response);
}

async function openNodes(graph: KnowledgeGraphManager, names: string[]): Promise<CallToolResult> {
  const response = await graph.openNodes(names);
  return createResponse(response);
}

export function knowledgeGraphMethodsFactory(graph: KnowledgeGraphManager): {
  createEntities: (entities: Entity[]) => Promise<CallToolResult>;
  createRelations: (relations: Relation[]) => Promise<CallToolResult>;
  addObservations: (observations: Observation[]) => Promise<CallToolResult>;
  deleteEntities: (entityNames: string[]) => Promise<CallToolResult>;
  deleteObservations: (deletions: Deletion[]) => Promise<CallToolResult>;
  deleteRelations: (relations: Relation[]) => Promise<CallToolResult>;
  readGraph: () => Promise<CallToolResult>;
  searchNodes: (query: string) => Promise<CallToolResult>;
  openNodes: (names: string[]) => Promise<CallToolResult>;
} {
  return {
    createEntities: createEntities.bind(null, graph),
    createRelations: createRelations.bind(null, graph),
    addObservations: addObservations.bind(null, graph),
    deleteEntities: deleteEntities.bind(null, graph),
    deleteObservations: deleteObservations.bind(null, graph),
    deleteRelations: deleteRelations.bind(null, graph),
    readGraph: readGraph.bind(null, graph),
    searchNodes: searchNodes.bind(null, graph),
    openNodes: openNodes.bind(null, graph),
  };
}
