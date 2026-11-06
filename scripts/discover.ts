/**
 * @description The `server/discover` request shared by the smoke tests
 * @license     MIT
 * @module
 */

import { MCP_PROTOCOL_VERSION } from "../src/shared/constants/app.ts";

export { MCP_PROTOCOL_VERSION };

/** A JSON-RPC `server/discover` request, as a string. */
export function discoverRequest(): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "server/discover",
    params: {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  });
}
