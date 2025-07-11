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

import { createApp } from "$/app/app.ts";
import { parseConfig } from "$/app/config.ts";
import { Logger } from "$/app/logger.ts";
import { createMcpServer } from "$/mcp/mod.ts";
import type { AppConfig } from "$/types.ts";

// Load environment variables
import "@std/dotenv/load";

// If the script is run directly, start the MCP server
if (import.meta.main) {
  // Load configuration
  const config: AppConfig = parseConfig();

  // server is the MCP server
  const server = createMcpServer();

  // logger is a wrapper for console.error
  const logger = new Logger(server, config.log);

  // app is a wrapper for HTTP and STDIO etc.
  const app = createApp(server, logger, config);
  await app.start();

  // Log some debug info
  setTimeout(() => {
    app.log.debug({
      data: {
        debug: "App config",
        details: app.config,
      },
    });
  }, 200);
}
