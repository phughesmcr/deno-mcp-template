import type { LogLevelKey } from "$/types.ts";
import DenoJson from "../../deno.json" with { type: "json" };

/** The MCP server's machine-facing name. */
export const APP_NAME = "deno-mcp-template";

/** The MCP server's human-facing title. */
export const APP_TITLE = "Deno MCP Template";

/** The MCP server's description. */
export const APP_DESCRIPTION = "A template for building MCP servers with Deno.";

/** The app's default log level. */
export const DEFAULT_LOG_LEVEL: LogLevelKey = "info";

// ********************************************************
// You should not need to change anything below this line.
// ********************************************************

/** The app's version. */
export const APP_VERSION = DenoJson.version;
