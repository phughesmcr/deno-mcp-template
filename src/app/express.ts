/**
 * @description HTTP server setup for MCP over HTTP transport
 * @module
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { join } from "@std/path";
import cors from "cors";
import serveStatic from "serve-static";

import { APP_NAME, HTTP_STATUS, RPC_ERROR_CODES, SESSION_ID_KEY } from "../constants.ts";
import type { SessionRecord } from "../types.ts";
import { createRPCError, createRPCSuccess } from "../utils.ts";
import { InMemoryEventStore } from "./inMemoryEventStore.ts";

export interface ExpressAppConfig {
  hostname: string;
  port: number;
  staticDir: string;
}

export interface ExpressApp {
  app: express.Application;
  transports: SessionRecord;
}

export function createHttpServer(config: ExpressAppConfig, server: Server): ExpressApp {
  const transports: SessionRecord = {};
  const app = express();
  app.use(express.json());

  // Make sure to set your allowed origins in `constants.ts`
  app.use(
    cors({
      origin: ALLOWED_ORIGINS,
      exposedHeaders: Object.values(HEADER_KEYS),
      allowedHeaders: ["Content-Type", ...Object.values(HEADER_KEYS)],
    }),
  );

  // Static Routes
  app.use("/.well-known", serveStatic(join(config.staticDir, ".well-known")));
  app.get("/llms.txt", (_req, res) => res.redirect("/.well-known/llms.txt"));
  app.get("/openapi.yaml", (_req, res) => res.redirect("/.well-known/openapi.yaml"));

  // MCP Routes
  app.post("/mcp", createMcpPostHandler(server, transports));
  app.get("/mcp", createMcpSessionHandler(transports));
  app.delete("/mcp", createMcpSessionHandler(transports));

  // Root route
  app.get("/", (_req, res) => {
    const message = `${APP_NAME} running. See \`/llms.txt\` for machine-readable docs.`;
    res.status(HTTP_STATUS.SUCCESS).json(createRPCSuccess(0, { message }));
  });

  return { app, transports };
}

function createMcpPostHandler(server: Server, transports: SessionRecord) {
  return async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const sessionId = req.headers[SESSION_ID_KEY] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (isInitializeRequest(req.body)) {
        const newSessionId = crypto.randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          enableJsonResponse: true,
          eventStore: new InMemoryEventStore(),
          onsessioninitialized: (actualSessionId) => {
            transports[actualSessionId] = transport;
          },
        });

        transports[newSessionId] = transport;
        await server.connect(transport);
      } else {
        res.status(HTTP_STATUS.BAD_REQUEST).json(
          createRPCError(
            req.body.id,
            RPC_ERROR_CODES.INVALID_REQUEST,
            "Bad Request: No valid session ID provided",
          ),
        );
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createRPCError(
            req.body.id,
            RPC_ERROR_CODES.INTERNAL_ERROR,
            "Internal server error",
          ),
        );
      }
    }
  };
}

function createMcpSessionHandler(transports: SessionRecord) {
  return async (req: express.Request, res: express.Response): Promise<void> => {
    const sessionId = req.headers[SESSION_ID_KEY] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(HTTP_STATUS.BAD_REQUEST).send("Invalid or missing session ID");
      return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };
}
