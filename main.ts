#!/usr/bin/env -S deno run -A

/**
 * @description A simple MCP server using Deno
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
 * # or with SSE (use `deno task start` first)
 * claude mcp add --transport http my-mcp-server http://127.0.0.1:3001/mcp
 * ```
 *
 * @module
 */

// Load environment variables
import "@std/dotenv/load";

import { createApp } from "./src/app/App.ts";
import { createMcpServer } from "./src/server.ts";

if (import.meta.main) {
  // server = the MCP server
  const server = createMcpServer();
  // app = a wrapper for Express and STDIO etc.
  const app = await createApp(server);
  await app.start();
}
