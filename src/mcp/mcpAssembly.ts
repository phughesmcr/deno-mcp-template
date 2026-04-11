/**
 * Options for {@link createMcpServer} assembly (definition override + task persistence ports).
 * @module
 */

import type { KvRuntime } from "$/kv/runtime.ts";
import type { McpServerDefinition } from "$/mcp/serverDefinition.ts";
import { KvTaskMessageQueue, KvTaskStore } from "$/mcp/tasks/mod.ts";

export type McpAssemblyPorts = {
  createTaskStore: (args: { maxTtlMs: number; kv: KvRuntime }) => KvTaskStore;
  createTaskMessageQueue: (args: { kv: KvRuntime }) => KvTaskMessageQueue;
};

export type McpAssemblyOptions = {
  definition?: McpServerDefinition;
  ports?: Partial<McpAssemblyPorts>;
};

export const defaultMcpAssemblyPorts: McpAssemblyPorts = {
  createTaskStore: (args) => new KvTaskStore({ maxTtlMs: args.maxTtlMs, kv: args.kv }),
  createTaskMessageQueue: (args) => new KvTaskMessageQueue(args.kv),
};

export function mergeMcpAssemblyPorts(partial?: Partial<McpAssemblyPorts>): McpAssemblyPorts {
  return { ...defaultMcpAssemblyPorts, ...partial };
}
