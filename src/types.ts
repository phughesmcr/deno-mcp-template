/**
 * @description Shared types for the MCP server
 * @module
 */

import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/** An object that maps session IDs to transports */
export interface SessionRecord {
  [sessionId: string]: StreamableHTTPServerTransport;
}
