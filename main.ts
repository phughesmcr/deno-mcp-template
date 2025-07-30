#!/usr/bin/env -S deno run -A

/**
 * @description An example MCP server using Deno
 *
 * @example claude-desktop-config.json using the published MCP server from JSR
 * ```json
 * {
 *   "mcpServers": {
 *     "my-published-mcp-server": {
 *       "command": "deno run -A jsr:@your-scope/your-package"
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
 *       "command": "deno run -A absolute/path/to/main.ts"
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

import { createApp } from "$/app/app.ts";
import { handleCliArgs } from "$/app/cli.ts";
import { createMcpServer } from "$/mcp/mod.ts";

// read env vars from .env file
import "@std/dotenv/load";

if (import.meta.main) {
  const config = await handleCliArgs();
  const mcp = createMcpServer();
  const app = await createApp(mcp, config);
  await app.start();
}
