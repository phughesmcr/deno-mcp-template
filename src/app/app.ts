/**
 * @description The main app for the MCP server
 * @module
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Application as ExpressApp } from "express";
import type { Server as NodeHttpServer } from "node:http";

import { APP_NAME } from "../constants.ts";
import type { AppConfig, AppSpec, ExpressResult, TransportRecord } from "../types.ts";
import { getConfig } from "./config.ts";
import { createExpressServer } from "./express.ts";
import { Logger } from "./logger.ts";

/** Sets up signal handlers for graceful shutdown */
function setupSignalHandlers(app: App): void {
  const exit = async (code: number, msg?: string) => {
    if (msg) app.alert(msg);
    await app.stop();
    Deno.exit(code);
  };

  // Handle beforeunload event
  globalThis.addEventListener("beforeunload", async (): Promise<void> => {
    await app.stop();
  });

  // Handle uncaught exceptions
  globalThis.addEventListener("unhandledrejection", async (): Promise<void> => {
    await exit(1, "Received unhandled rejection, attempting to shut down gracefully...");
  });

  // Handle SIGINT (Ctrl+C)
  Deno.addSignalListener("SIGINT", async (): Promise<void> => {
    await exit(0, "Received SIGINT, shutting down gracefully...");
  });

  // Handle SIGTERM
  if (Deno.build.os !== "windows") {
    Deno.addSignalListener("SIGTERM", async (): Promise<void> => {
      await exit(0, "Received SIGTERM, shutting down gracefully...");
    });
  }
}

class App extends Logger {
  /** The Express app for HTTP */
  #expressApp: ExpressApp;

  /** The Express server or null if not running */
  #expressServer: NodeHttpServer | null = null;

  /** The configuration for the app */
  #config: AppConfig;

  /** Whether the server is running */
  #running = false;

  /** The MCP server */
  #server: Server;

  /** The HTTP transports */
  #httpTransports: TransportRecord;

  /** The STDIO transport */
  #stdioTransport: StdioServerTransport | null = null;

  /**
   * Creates a new App instance
   * @param spec - properties to construct the app with
   */
  constructor(spec: AppSpec) {
    const { app, config, server, transports } = spec;
    super(server, config.log);
    this.#server = server;
    this.#config = config;
    this.#httpTransports = transports;
    this.#expressApp = app;
  }

  /** Starts the server */
  async start(): Promise<void> {
    if (this.#running) return;

    // Start STDIO transport
    this.#stdioTransport = new StdioServerTransport();
    await this.#server.connect(this.#stdioTransport);
    this.info(`MCP server ${APP_NAME} is listening on STDIO.`);

    // Start HTTP server
    const { hostname, port } = this.#config;
    this.#expressServer = this.#expressApp.listen(port, hostname, () => {
      this.info(`MCP server ${APP_NAME} is listening on ${hostname}:${port}.`);
    });

    this.#running = true;
  }

  /** Stops the server */
  async stop(): Promise<void> {
    if (!this.#running) return;

    // Close all session transports
    let errorCount = 0;
    let successCount = 0;
    const closeTransport = async (transport: StreamableHTTPServerTransport) => {
      try {
        await transport?.close();
        successCount++;
      } catch (error) {
        this.error({
          data: {
            message: `Error closing transport: ${
              (error instanceof Error) ? error.message : String(error)
            }`,
            details: error,
          },
        });
        errorCount++;
      }
    };
    await Promise.allSettled(Object.values(this.#httpTransports).map(closeTransport));
    this.info(`Closed ${successCount} transports, ${errorCount} errors`);

    // Close STDIO transport
    if (this.#stdioTransport) {
      try {
        await this.#stdioTransport.close();
        this.#stdioTransport = null;
        this.info("Closed STDIO transport");
      } catch (error) {
        this.error({
          data: {
            error: `Error closing transport: ${
              (error instanceof Error) ? error.message : String(error)
            }`,
            details: error,
          },
        });
      }
    }

    // Close Express server
    if (this.#expressServer) {
      try {
        this.#expressServer.close();
        this.#expressServer = null;
        this.info("Closed Express server");
      } catch (error) {
        this.error({
          data: {
            error: `Error closing Express server: ${
              (error instanceof Error) ? error.message : String(error)
            }`,
            details: error,
          },
        });
      }
    }

    this.#running = false;
  }
}

/**
 * Factory function for creating an App instance to avoid throwables in the constructor
 * @param server - The MCP server
 * @param config - The configuration for the app, defaults to the config from the CLI / env
 * @returns The App instance
 */
export function createApp(server: Server): App {
  // Construct the config
  const config: AppConfig = getConfig();

  // Create HTTP server and get transports
  const express: ExpressResult = createExpressServer(config, server);

  // Create the app
  const result = new App({
    app: express.app,
    config,
    server,
    transports: express.transports,
  });

  // Setup signal handlers
  setupSignalHandlers(result);

  // Log the configuration
  result.debug({
    data: {
      debug: "Configuration",
      details: {
        hasStaticDir: !!config.staticDir,
        hostname: config.hostname,
        log: config.log,
        port: config.port,
        allowedHosts: express.allowedHosts,
        allowedOrigins: express.allowedOrigins,
      },
    },
  });

  return result;
}

export type { App };
