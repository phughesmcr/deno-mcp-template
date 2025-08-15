import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { APP_NAME } from "$/shared/constants.ts";
import type { AppConfig, Transport } from "$/shared/types.ts";

/**
 * Creates a new STDIO transport manager
 * @param mcp - The MCP server
 * @param config - The configuration for the STDIO transport
 * @returns The transport manager
 */
export function createStdioManager(mcp: McpServer, { enabled }: AppConfig["stdio"]): Transport {
  let transport: StdioServerTransport | null = null;

  /** Get or create the STDIO transport */
  const acquire = async () => {
    if (transport) return transport;
    transport = new StdioServerTransport();
    return transport;
  };

  /** Release the STDIO transport */
  const release = async () => {
    try {
      if (!transport) return;
      await transport.close();
    } finally {
      transport = null;
    }
  };

  /** Connect the MCP server to the STDIO transport */
  const connect = async () => {
    if (!enabled) return;
    const transport = await acquire();
    await mcp.connect(transport);
    console.error(`${APP_NAME} connected to STDIO`);
  };

  /** Disconnect the MCP server from the STDIO transport */
  const disconnect = async () => {
    if (!enabled) return;
    await release();
  };

  /** Check if the STDIO transport is running */
  const isRunning = () => !!transport;

  /** Check if the STDIO transport is enabled */
  const isEnabled = () => enabled;

  return {
    connect,
    disconnect,
    isEnabled,
    isRunning,
  };
}
