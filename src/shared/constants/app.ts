import DenoJson from "../../../deno.json" with { type: "json" };

/** The MCP server's machine-facing name. */
export const APP_NAME = "deno-mcp-template";

/** The MCP server's human-facing title. */
export const APP_TITLE = "Deno MCP Template";

/** The MCP server's description. */
export const APP_DESCRIPTION = "A template for building MCP servers with Deno.";

// ********************************************************
// You should not need to change anything below this line.
// ********************************************************

/** The app's version. */
export const APP_VERSION = DenoJson.version;

/** The app's version string. */
export const APP_VERSION_STR = `${APP_NAME} v${APP_VERSION}`;

/** The app's usage string. */
export const APP_USAGE = Deno.build.standalone ?
  (import.meta.filename || APP_NAME) :
  "deno task start";

/**
 * Default ceiling for client-requested task TTL (ms). `KvTaskStore` clamps higher values and
 * returns the effective TTL on the `Task` object (per MCP `TaskStore` contract).
 */
export const DEFAULT_MAX_TASK_TTL_MS = 86_400_000; // 24 hours

/** Minimum allowed value for the `--max-task-ttl-ms` / `MCP_MAX_TASK_TTL_MS` knob. */
export const MIN_MAX_TASK_TTL_MS = 60_000; // 1 minute

/** Maximum allowed value for the `--max-task-ttl-ms` / `MCP_MAX_TASK_TTL_MS` knob. */
export const ABSOLUTE_MAX_TASK_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
