/**
 * @description A barrel file for exporting the knowledge graph tool cleanly
 * @see         {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import { KV } from "../../constants.ts";
import { KnowledgeGraphManager } from "./knowledgeGraphManager.ts";
import { knowledgeGraphMethodsFactory } from "./methods.ts";
import { knowledgeGraphToolSchema } from "./schema.ts";

// The knowledge graph MCP tool
export const knowledgeGraph = knowledgeGraphMethodsFactory(new KnowledgeGraphManager(KV));
export * from "./types.ts";
export { type KnowledgeGraphManager, knowledgeGraphToolSchema };
