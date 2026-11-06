/**
 * @description MCP server related constants (re-exported from the MCP server definition).
 * @module
 */

export { MCP_APPS_EXTENSION_ID, SERVER_INFO } from "$/mcp/serverDefinition.ts";

/** Minimum `MCP_REQUEST_STATE_KEY` length in bytes (the SDK codec rejects anything shorter). */
export const REQUEST_STATE_KEY_MIN_BYTES = 32;

/** How long signed `requestState` stays valid; long enough for a URL elicitation to finish. */
export const REQUEST_STATE_TTL_SECONDS = 60 * 60;
