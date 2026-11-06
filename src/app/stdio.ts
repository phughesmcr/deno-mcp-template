import type { McpServer, ServerEvent, ServerEventBus } from "@modelcontextprotocol/server";
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import type { AppConfig, Transport } from "$/shared/config-types.ts";
import { APP_NAME } from "$/shared/constants.ts";

function sendEvent(server: McpServer, event: ServerEvent): Promise<void> | void {
  switch (event.kind) {
    case "tools_list_changed":
      return server.sendToolListChanged();
    case "prompts_list_changed":
      return server.sendPromptListChanged();
    case "resources_list_changed":
      return server.sendResourceListChanged();
    case "resource_updated":
      return server.server.sendResourceUpdated({ uri: event.uri });
  }
}

/**
 * Creates a new STDIO transport manager
 * @param createServer - Builds a server; `serveStdio` also calls this for a discarded discovery
 * probe, so change events go to the newest instance only
 * @param events - Change events to forward to the connected client
 * @param config - The configuration for the STDIO transport
 * @param onClientClosed - Called when the client ends the connection, usually by closing stdin
 * @returns The transport manager
 */
export function createStdioManager(
  createServer: () => McpServer,
  events: ServerEventBus,
  { enabled }: AppConfig["stdio"],
  onClientClosed: () => void,
): Transport {
  let handle: ReturnType<typeof serveStdio> | null = null;
  let unsubscribe: (() => void) | null = null;
  let current: McpServer | null = null;

  /** Forward a change event; a client that has not connected yet has nothing to receive it. */
  const forward = async (event: ServerEvent) => {
    if (!current) return;
    try {
      await sendEvent(current, event);
    } catch (error) {
      console.error(`${APP_NAME}: STDIO notification failed`, error);
    }
  };

  const connect = () => {
    if (!enabled || handle) return;
    const transport = new StdioServerTransport();
    handle = serveStdio(() => {
      current = createServer();
      return current;
    }, {
      transport,
      legacy: "reject",
      onerror: (error) => console.error(`${APP_NAME}: STDIO error`, error),
    });
    // `serveStdio` has no close callback and uses `onclose` itself, so chain onto its handler.
    const closeServer = transport.onclose;
    transport.onclose = () => {
      closeServer?.();
      if (handle) onClientClosed(); // No handle means `disconnect` closed it, not the client.
    };
    unsubscribe = events.subscribe(forward);
    console.error(`${APP_NAME} connected to STDIO`);
  };

  const disconnect = async () => {
    if (!handle) return;
    const closing = handle;
    handle = null;
    current = null;
    unsubscribe?.();
    unsubscribe = null;
    await closing.close();
    console.error(`${APP_NAME} disconnected from STDIO`);
  };

  return {
    connect,
    disconnect,
    isEnabled: () => enabled,
    isRunning: () => !!handle,
  };
}
