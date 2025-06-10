import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import {
  JSONRPC_VERSION,
  type JSONRPCError,
  type JSONRPCResponse,
  type RequestId,
  type Result,
} from "../vendor/schema.ts";
import { DEFAULT_HOSTNAME, DEFAULT_PORT } from "./constants.ts";
import type { SessionRecord } from "./types.ts";

export function createRPCError(id: RequestId, code: number, message: string): JSONRPCError {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: { code, message },
  };
}

export function createRPCSuccess(id: RequestId, result: Result): JSONRPCResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

export function getPort(): number {
  const env = Deno.env.get("PORT");
  if (env === undefined) {
    return DEFAULT_PORT;
  }
  const port = parseInt(env, 10);
  if (isNaN(port)) {
    throw new Error("PORT environment variable must be a number");
  }
  return port;
}

export function getHostname(): string {
  const env = Deno.env.get("HOSTNAME");
  if (env === undefined) {
    return DEFAULT_HOSTNAME;
  }
  const hostname = env.trim();
  if (hostname === "") {
    return DEFAULT_HOSTNAME;
  }
  return hostname;
}

export async function closeTransports(transports: SessionRecord): Promise<void> {
  for (const sessionId in transports) {
    const transport = transports[sessionId];
    try {
      await transport?.close();
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
}

export function safelyCloseServer(server: Server): void {
  try {
    server.close();
  } catch (error) {
    console.error("Error closing server:", error);
  }
}
