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
import { MCP_SERVER_NAME, SESSION_ID_HEADER } from "./src/constants.ts";
import { createErrorResponse } from "./src/utils.ts";
import { INTERNAL_ERROR, METHOD_NOT_FOUND } from "./vendor/schema.ts";

// Load environment variables
import "@std/dotenv/load";

// Import the main MCP tools etc.
import { server } from "./src/mcp/mod.ts";

/**
 * A simple file-based router for Deno.serve
 *
 * Add your routes to the `routes/` directory.
 * Add static files to the `static/` directory.
 */
export async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const method = req.method;
  const id = req.headers.get(SESSION_ID_HEADER) ?? -1;

  const path = pathname === "/" ? "/index" : pathname;
  let module;

  try {
    module = await import(`./routes${path}.ts`);
  } catch (error) {
    console.error("No route module found for", path, error);
  }

  if (module && module[method]) {
    try {
      return module[method](req);
    } catch (error) {
      console.error("Error in route:", path, method, error);

      return createErrorResponse(id, INTERNAL_ERROR, "Internal server error");
    }
  }

  return createErrorResponse(id, METHOD_NOT_FOUND, `${`./routes${path}.ts`} [${method}] Not found`);
}

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
    pattern: new URLPattern({ pathname: "/openapi.yaml" }),
    handler: async (req: Request) => {
      const response = await serveFile(req, "./static/.well-known/openapi.yaml");
      response.headers.set("Content-Type", "text/yaml");
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
    }, route(routes, handler));
    // This handles STDIO requests
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${MCP_SERVER_NAME} MCP server is listening on STDIO`);
  } catch (error) {
    console.error("Fatal error:", error);
    Deno.exit(1);
  }
}
