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
import { MCP_SERVER_NAME } from "./src/constants.ts";
import { createErrorResponse, getSessionId } from "./src/utils.ts";
import { METHOD_NOT_FOUND } from "./vendor/schema.ts";

// Load environment variables
import "@std/dotenv/load";

// Import the main MCP tools etc.
import { server } from "./src/mcp/mod.ts";

const defaultHandler = async (req: Request) => {
  const id = await getSessionId(req) ?? -1;
  return createErrorResponse(id, METHOD_NOT_FOUND, "Not found");
};

// Serve static files
const routes: Route[] = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/" }),
    handler: async (req: Request) => {
      if (req.method === "GET") {
        const route = await import(`./routes/index.ts`);
        return route.GET(req);
      }
      const id = await getSessionId(req) ?? -1;
      return createErrorResponse(id, METHOD_NOT_FOUND, "Not found");
    },
  },
  {
    method: ["GET", "POST", "DELETE"],
    pattern: new URLPattern({ pathname: "/mcp" }),
    handler: async (req: Request) => {
      const route = await import(`./routes/mcp.ts`);
      if (req.method === "GET") {
        return route.GET(req);
      } else if (req.method === "POST") {
        return route.POST(req);
      } else if (req.method === "DELETE") {
        return route.DELETE(req);
      }
      const id = await getSessionId(req) ?? -1;
      return createErrorResponse(id, METHOD_NOT_FOUND, "Not found");
    },
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/sse" }),
    handler: async (req: Request) => {
      if (req.method === "GET") {
        const route = await import(`./routes/sse.ts`);
        return route.GET(req);
      }
      const id = await getSessionId(req) ?? -1;
      return createErrorResponse(id, METHOD_NOT_FOUND, "Not found");
    },
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/message" }),
    handler: async (req: Request) => {
      const route = await import(`./routes/message.ts`);
      return route.POST(req);
    },
  },
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
    }, route(routes, defaultHandler));
    // This handles STDIO requests
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${MCP_SERVER_NAME} MCP server is listening on STDIO`);
  } catch (error) {
    console.error("Fatal error:", error);
    Deno.exit(1);
  }
}
