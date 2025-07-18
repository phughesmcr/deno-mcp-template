#!/usr/bin/env -S deno run -A

/**
 * @description An example MCP server using Deno
 *
 * @example claude-desktop-config.json using the published MCP server from JSR
 * ```json
 * {
 *   "mcpServers": {
 *     "my-published-mcp-server": {
 *       "command": "deno run -A --unstable-kv jsr:@your-scope/your-package"
 *     },
 *   }
 * }
 * ```
 *
 * @example claude-desktop-config.json manually using the HTTP endpoint
 * Start the server using `deno task start` first.
 * ```json
 * {
 *   "mcpServers": {
 *     "my-mcp-server": {
 *       "command": "npx",
 *       "args": ["mcp-remote", "http://localhost:3001/mcp"]
 *     },
 *   }
 * }
 * ```
 *
 * @example claude-desktop-config.json using a local MCP server
 * ```json
 * {
 *   "mcpServers": {
 *     "my-local-mcp-server": {
 *       "command": "deno run -A --unstable-kv absolute/path/to/main.ts"
 *     },
 *   }
 * }
 * ```
 *
 * @example Claude Code
 * ```bash
 * # Compiled binary:
 * claude mcp add my-mcp-server "absolute/path/to/binary"
 *
 * # or with HTTP (use `deno task start` first)
 * claude mcp add --transport http my-mcp-server http://localhost:3001/mcp
 * ```
 *
 * @module
 */

import { App } from "$/app/app.ts";
import { handleCliArgs } from "$/app/cli.ts";
import { Config } from "$/app/config.ts";
import { createMcpServer } from "$/mcp/mod.ts";
import type { AppConfig } from "$/types.ts";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

// read env vars from .env file
import "@std/dotenv/load";

// If the script is run directly, start the MCP server
if (import.meta.main) {
  // Parse CLI arguments and env vars
  const args: AppConfig = handleCliArgs();

  // Convert args to a Config object
  const config = new Config(args);

  // Create the MCP server
  const mcp: Server = createMcpServer();

  // The app is a wrapper for HTTP and STDIO etc.
  const app = new App(mcp, config);
  await app.start();
}
