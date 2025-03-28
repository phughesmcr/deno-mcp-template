#!/usr/bin/env -S deno run -A

/**
 * @description A simple MCP server using Deno
 * @author P. Hughes <github@phugh.es>
 * @license MIT
 *
 * @example claude-desktop-config.json using the published MCP server from JSR
 * ```json
 * {
 *   "mcpServers": {
 *     "my-published-mcp-server": {
 *       "command": "deno run -A --unstable-kv jsr:@phughesmcr/deno-mcp-template"
 *     },
 *   }
 * }
 * ```
 *
 * @example claude-desktop-config.json manually using the SSE endpoint
 * Start the server using `deno task start` first.
 * ```json
 * {
 *   "mcpServers": {
 *     "my-mcp-server": {
 *       "url": "http://localhost:3001/sse"
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
 *       "url": "http://localhost:3001/mcp"
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
 * @module
 */

import { type Route, route } from "@std/http/unstable-route";
import { serveFile } from "@std/http/file-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { routeHandler } from "./src/utils.ts";
import { MCP_SERVER_NAME } from "./src/constants.ts";

// Load environment variables
import "@std/dotenv/load";

// Import the main MCP tools etc.
import { server } from "./src/mcp/mod.ts";

// Serve static files
const routes: Route[] = [
  {
    pattern: new URLPattern({ pathname: "/llms.txt" }),
    handler: async (req: Request) => {
      const response = await serveFile(req, "./static/.well-known/llms.txt");
      response.headers.set("Content-Type", "text/plain");
      return response;
    },
  },
  {
    // match routes ending in a file extension
    pattern: new URLPattern({ pathname: "/*.*" }),
    handler: (req: Request) => {
      const url = new URL(req.url);
      const pathname = url.pathname;
      const filePath = `./static${pathname}`;
      return serveFile(req, filePath);
    },
  },
];

if (import.meta.main) {
  try {
    // This handles both SSE / Streaming HTTP requests and web routes
    Deno.serve({
      port: parseInt(Deno.env.get("PORT") || "3001"),
      hostname: Deno.env.get("HOSTNAME"),
      onListen({ port, hostname }) {
        console.error(
          `${MCP_SERVER_NAME} MCP server is listening on ${hostname}:${port}`,
        );
      },
    }, route(routes, routeHandler));
    // This handles STDIO requests
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${MCP_SERVER_NAME} MCP server is listening on STDIO`);
  } catch (error) {
    console.error("Fatal error:", error);
    Deno.exit(1);
  }
}
