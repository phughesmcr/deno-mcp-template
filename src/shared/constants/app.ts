import type { LogLevelKey } from "$/shared/types.ts";
import DenoJson from "../../../deno.json" with { type: "json" };

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

/** The app's version string. */
export const APP_VERSION_STR = `${APP_NAME} v${APP_VERSION}`;

/** The app's usage string. */
export const APP_USAGE = Deno.build.standalone ?
  (import.meta.filename || APP_NAME) :
  "deno task start";
