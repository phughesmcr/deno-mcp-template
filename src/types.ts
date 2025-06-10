import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// ********************
// *   Server Types   *
// ********************

export interface SessionRecord {
  [sessionId: string]: StreamableHTTPServerTransport;
}

// ***************************
// *  Knowledge Graph Types  *
// ***************************

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
