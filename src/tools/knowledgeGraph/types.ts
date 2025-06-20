/**
 * @description Types used by the knowledge graph tools
 * @see {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

export interface Observation {
  entityName: string;
  contents: string[];
}

export interface Deletion {
  entityName: string;
  observations: string[];
}

export interface AddObservationResult {
  entityName: string;
  addedObservations: string[];
}
