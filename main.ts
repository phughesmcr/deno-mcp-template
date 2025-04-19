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
 *       "url": "http://127.0.0.1:3001/mcp"
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

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { join } from "@std/path";
import express from "express";
import serveStatic from "serve-static";
import { APP, JSONRPC } from "./src/constants.ts";
import { InMemoryEventStore } from "./src/inMemoryEventStore.ts";

// Load environment variables
import "@std/dotenv/load";

// Import the main MCP tools etc.
import { server } from "./src/mod.ts";

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

const closeTransports = async () => {
  for (const sessionId in transports) {
    const transport = transports[sessionId];
    try {
      await transport?.close();
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  try {
    await server.close();
  } catch (error) {
    console.error("Error closing server:", error);
  }
};

globalThis.addEventListener("beforeunload", async () => {
  await closeTransports();
});

Deno.addSignalListener("SIGINT", async () => {
  await closeTransports();
  Deno.exit(0);
});

if (import.meta.main) {
  try {
    // This handles both Streaming HTTP requests and web routes
    const port = parseInt(Deno.env.get("PORT") || "3001", 10);
    const hostname = Deno.env.get("HOSTNAME") || "127.0.0.1";

    const app = express();
    app.use(express.json());

    app.use("/.well-known", serveStatic(join(import.meta.dirname ?? "", "static", ".well-known")));

    app.get("/llms.txt", (_req, res) => {
      res.redirect("/.well-known/llms.txt");
    });

    app.get("/openapi.yaml", (_req, res) => {
      res.redirect("/.well-known/openapi.yaml");
    });

    // Handle POST requests for client-to-server communication
    app.post("/mcp", async (req, res) => {
      try {
        // Check for existing session ID
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request - use JSON response mode
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            enableJsonResponse: true,
            eventStore: new InMemoryEventStore(),
            onsessioninitialized: (sessionId) => {
              transports[sessionId] = transport;
            },
          });

          // Connect the transport to the MCP server BEFORE handling the request
          await server.connect(transport);
        } else {
          // Invalid request - no session ID or not initialization request
          res.status(400).json({
            jsonrpc: JSONRPC.VERSION,
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          });
          return;
        }

        // Handle the request with existing transport - no need to reconnect
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: JSONRPC.VERSION,
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    });

    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (req: express.Request, res: express.Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }

      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    };

    // Handle GET requests for server-to-client notifications
    app.get("/mcp", handleSessionRequest);

    // Handle DELETE requests for session termination
    app.delete("/mcp", handleSessionRequest);

    // Serve index.html
    app.get("/", (_req, res) => {
      const message = `${APP.NAME} running. See \`/llms.txt\` for machine-readable docs.`;
      res.status(200).json({
        jsonrpc: JSONRPC.VERSION,
        id: null,
        result: { message },
      });
    });

    app.listen(
      port,
      hostname,
      () => {
        console.error(`${APP.NAME} MCP server is listening on ${hostname}:${port}`);
      },
    );

    // This handles STDIO requests
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${APP.NAME} MCP server is listening on STDIO`);
  } catch (error) {
    console.error("Fatal error:", error);
    await closeTransports();
    Deno.exit(1);
  }
}
