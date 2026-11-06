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

/** The app's usage string. */
export const APP_USAGE = Deno.build.standalone ? APP_NAME : "deno task start";

/** The MCP protocol revision this server speaks. `--legacy-stdio` adds 2025-era STDIO clients. */
export const MCP_PROTOCOL_VERSION = "2026-07-28";
