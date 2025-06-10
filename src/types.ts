import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { JSONRPCMessage } from "../vendor/schema.ts";

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

export interface SessionRecord {
  [sessionId: string]: StreamableHTTPServerTransport;
}

export type McpEvent = { streamId: string; message: JSONRPCMessage };

export type McpEventSender = (eventId: string, message: JSONRPCMessage) => Promise<void>;
