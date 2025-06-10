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

import { APP_NAME, HTTP_STATUS, RPC_ERROR_CODES, SESSION_ID_KEY } from "./src/constants.ts";
import { InMemoryEventStore } from "./src/inMemoryEventStore.ts";
import type { SessionRecord } from "./src/types.ts";

// Load environment variables
import "@std/dotenv/load";

// Import the main MCP tools etc.
import { server } from "./src/mod.ts";
import {
  closeTransports,
  createRPCError,
  createRPCSuccess,
  getHostname,
  getPort,
  safelyCloseServer,
} from "./src/utils.ts";

if (import.meta.main) {
  // Map to store transports by session ID
  const transports: SessionRecord = {};

  try {
    // Handle beforeunload event
    globalThis.addEventListener("beforeunload", async (): Promise<void> => {
      await closeTransports(transports);
      safelyCloseServer(server);
    });

    // Handle SIGINT signal
    Deno.addSignalListener("SIGINT", async (): Promise<void> => {
      await closeTransports(transports);
      safelyCloseServer(server);
      Deno.exit(0);
    });

    // We use Express to handle both Streaming HTTP requests and web routes
    const port = getPort();
    const hostname = getHostname(); // use 0.0.0.0 to listen on all interfaces
    const app = express();
    app.use(express.json());

    // *******************
    // *  Static Routes  *
    // *******************

    // Serve the .well-known directory
    app.use("/.well-known", serveStatic(join(import.meta.dirname ?? "", "static", ".well-known")));

    // Redirect to the .well-known/llms.txt file directly as /llms.txt
    app.get("/llms.txt", (_req: express.Request, res: express.Response): void => {
      res.redirect("/.well-known/llms.txt");
    });

    // Redirect to the .well-known/openapi.yaml file directly as /openapi.yaml
    app.get("/openapi.yaml", (_req: express.Request, res: express.Response): void => {
      res.redirect("/.well-known/openapi.yaml");
    });

    // ****************
    // *  MCP Routes  *
    // ****************

    // Handle POST requests for client-to-server communication
    app.post("/mcp", async (req: express.Request, res: express.Response): Promise<void> => {
      try {
        // Check for existing session ID
        const sessionId = req.headers[SESSION_ID_KEY] as string | undefined;

        // Reuse existing transport if session ID is provided,
        // otherwise create a new one if we get an `initialize` request
        let transport: StreamableHTTPServerTransport;
        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
        } else if (isInitializeRequest(req.body)) {
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
          // Invalid request - no session ID and not an initialization request
          res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json(
              createRPCError(
                req.body.id,
                RPC_ERROR_CODES.INVALID_REQUEST,
                "Bad Request: No valid session ID provided",
              ),
            );
          return;
        }

        // Handle the request with existing transport - no need to reconnect
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res
            .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .json(
              createRPCError(
                req.body.id,
                RPC_ERROR_CODES.INTERNAL_ERROR,
                "Internal server error",
              ),
            );
        }
      }
    });

    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (
      req: express.Request,
      res: express.Response,
    ): Promise<void> => {
      const sessionId = req.headers[SESSION_ID_KEY] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(HTTP_STATUS.BAD_REQUEST).send("Invalid or missing session ID");
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
    app.get("/", (_req: express.Request, res: express.Response): void => {
      const message = `${APP_NAME} running. See \`/llms.txt\` for machine-readable docs.`;
      res.status(HTTP_STATUS.SUCCESS).json(createRPCSuccess(-1, { message }));
    });

    app.listen(
      port,
      hostname,
      (): void => {
        // Note: You should use console.error instead of console.log
        // because .log will interfere with the STDIO transport
        console.error(`${APP_NAME} MCP server is listening on ${hostname}:${port}`);
      },
    );

    // This handles STDIO requests
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error(`${APP_NAME} MCP server is listening on STDIO`);
  } catch (error) {
    console.error("Fatal error:", error);
    await closeTransports(transports);
    safelyCloseServer(server);
    Deno.exit(1);
  }
}
