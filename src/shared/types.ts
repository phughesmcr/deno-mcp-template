/**
 * @description Re-exports host configuration types and shared utilities. For MCP plugin registration shapes (tools, prompts, resources), use `$/mcp/plugin-types.ts`.
 * @module
 */

export type {
  AppConfig,
  HttpServerConfig,
  KvConfig,
  StdioConfig,
  TasksConfig,
  Transport,
} from "$/shared/config-types.ts";

export type { Prettify } from "$/shared/type-utils.ts";
