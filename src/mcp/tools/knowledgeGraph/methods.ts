/**
 * @description An interface between the knowledge graph manager and the MCP server
 * @module
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { createCallToolTextResponse } from "$/utils.ts";
import type {
  Deletion,
  Entity,
  KnowledgeGraphManager,
  Observation,
  Relation,
} from "./knowledgeGraphManager.ts";

async function createEntities(
  graph: KnowledgeGraphManager,
  entities: Entity[],
): Promise<CallToolResult> {
  const createdEntities = await graph.createEntities(entities);
  return createCallToolTextResponse(createdEntities);
}

async function createRelations(
  graph: KnowledgeGraphManager,
  relations: Relation[],
): Promise<CallToolResult> {
  const createdRelations = await graph.createRelations(relations);
  return createCallToolTextResponse(createdRelations);
}

async function addObservations(
  graph: KnowledgeGraphManager,
  observations: Observation[],
): Promise<CallToolResult> {
  const addedObservations = await graph.addObservations(observations);
  return createCallToolTextResponse(addedObservations);
}

async function deleteEntities(
  graph: KnowledgeGraphManager,
  entityNames: string[],
): Promise<CallToolResult> {
  await graph.deleteEntities(entityNames);
  return createCallToolTextResponse("Entities deleted successfully");
}

async function deleteObservations(
  graph: KnowledgeGraphManager,
  deletions: Deletion[],
): Promise<CallToolResult> {
  await graph.deleteObservations(deletions);
  return createCallToolTextResponse("Observations deleted successfully");
}

async function deleteRelations(
  graph: KnowledgeGraphManager,
  relations: Relation[],
): Promise<CallToolResult> {
  await graph.deleteRelations(relations);
  return createCallToolTextResponse("Relations deleted successfully");
}

async function readGraph(graph: KnowledgeGraphManager): Promise<CallToolResult> {
  const response = await graph.readGraph();
  return createCallToolTextResponse(response);
}

async function searchNodes(graph: KnowledgeGraphManager, query: string): Promise<CallToolResult> {
  const response = await graph.searchNodes(query);
  return createCallToolTextResponse(response);
}

async function openNodes(graph: KnowledgeGraphManager, names: string[]): Promise<CallToolResult> {
  const response = await graph.openNodes(names);
  return createCallToolTextResponse(response);
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
