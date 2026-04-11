/**
 * Pairs each {@link WebStandardStreamableHTTPServerTransport} with an {@link McpServer},
 * deduplicating `connect` for concurrent callers and clearing caches on failure.
 * @module
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export type CreateMcpServer = () => McpServer;

export type EnsureTransportConnected = (
  transport: WebStandardStreamableHTTPServerTransport,
) => Promise<void>;

export type TransportMcpConnector = EnsureTransportConnected & {
  reset(transport: WebStandardStreamableHTTPServerTransport): void;
};

/**
 * Returns a function that ensures `mcp.connect(transport)` has completed for this transport,
 * sharing one in-flight promise for concurrent callers.
 */
export function createEnsureTransportConnected(
  createMcpServer: CreateMcpServer,
): EnsureTransportConnected {
  const connector = createTransportMcpConnector(createMcpServer);
  return (transport) => connector(transport);
}

/**
 * Like {@link createEnsureTransportConnected} but exposes {@link TransportMcpConnector.reset}
 * for tests and advanced teardown.
 */
export function createTransportMcpConnector(
  createMcpServer: CreateMcpServer,
): TransportMcpConnector {
  const mcpByTransport = new WeakMap<WebStandardStreamableHTTPServerTransport, McpServer>();
  const connectionByTransport = new WeakMap<
    WebStandardStreamableHTTPServerTransport,
    Promise<void>
  >();

  const ensure = async (
    transport: WebStandardStreamableHTTPServerTransport,
  ): Promise<void> => {
    const existingConnection = connectionByTransport.get(transport);
    if (existingConnection) {
      await existingConnection;
      return;
    }

    let mcp = mcpByTransport.get(transport);
    if (!mcp) {
      mcp = createMcpServer();
      mcpByTransport.set(transport, mcp);
    }

    const connection = mcp.connect(transport);
    connectionByTransport.set(transport, connection);

    try {
      await connection;
    } catch (error) {
      connectionByTransport.delete(transport);
      mcpByTransport.delete(transport);
      throw error;
    }
  };

  const reset = (transport: WebStandardStreamableHTTPServerTransport): void => {
    connectionByTransport.delete(transport);
    mcpByTransport.delete(transport);
  };

  return Object.assign(ensure, { reset });
}
