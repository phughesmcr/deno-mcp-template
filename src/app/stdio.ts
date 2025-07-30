import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { APP_NAME } from "$/shared/constants.ts";
import type { AppConfig } from "$/shared/types.ts";

export interface StdioTransportManager {
  enabled: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isRunning: () => boolean;
}

export function createStdioTransportManager(
  mcp: McpServer,
  config: AppConfig["stdio"],
): StdioTransportManager {
  const { enabled } = config;
  let transport: StdioServerTransport | null = null;

  const acquire = async () => {
    if (!enabled) throw new Error("STDIO transport is disabled");
    if (transport) return transport;
    transport = new StdioServerTransport();
    return transport;
  };

  const release = async () => {
    if (!transport) return;
    try {
      await transport.close();
    } finally {
      transport = null;
    }
  };

  const connect = async () => {
    if (enabled) {
      try {
        const transport = await acquire();
        await mcp.connect(transport);
        console.error(`${APP_NAME} connected to STDIO`);
      } catch (error) {
        console.error(`${APP_NAME} failed to connect to STDIO: ${error}`);
      }
    }
  };

  const disconnect = async () => {
    if (enabled) {
      try {
        await release();
      } catch (error) {
        console.error(`${APP_NAME} failed to disconnect from STDIO: ${error}`);
      }
    }
  };

  const isRunning = () => {
    return !!transport;
  };

  return {
    get enabled(): boolean {
      return enabled;
    },
    connect,
    disconnect,
    isRunning,
  };
}
