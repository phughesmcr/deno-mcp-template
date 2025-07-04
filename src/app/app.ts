/**
 * @description The main app for the MCP server
 * @module
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Application as ExpressApp } from "express";
import type { Server as NodeHttpServer } from "node:http";

import { APP_NAME } from "../constants.ts";
import type { AppConfig, AppSpec, ExpressResult, TransportRecord } from "../types.ts";
import { getConfig } from "./config.ts";
import { createExpressServer } from "./express.ts";
import { Logger } from "./logger.ts";

/** Sets up signal handlers for graceful shutdown */
function setupSignalHandlers(app: App): void {
  // Handle beforeunload event (for web environments)
  globalThis.addEventListener("beforeunload", async (): Promise<void> => {
    await app.stop();
  });

  // Handle uncaught exceptions
  globalThis.addEventListener("unhandledrejection", async (): Promise<void> => {
    app.alert("Received unhandled rejection, attempting to shut down gracefully...");
    await app.stop();
    Deno.exit(1);
  });

  // Handle SIGINT (Ctrl+C)
  Deno.addSignalListener("SIGINT", async (): Promise<void> => {
    app.alert("Received SIGINT, shutting down gracefully...");
    await app.stop();
    Deno.exit(0);
  });

  // Handle SIGTERM
  if (Deno.build.os !== "windows") {
    Deno.addSignalListener("SIGTERM", async (): Promise<void> => {
      app.alert("Received SIGTERM, shutting down gracefully...");
      await app.stop();
      Deno.exit(0);
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
    super(server, spec.config.debug ? "debug" : "info");
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
    await Promise.allSettled(
      Object.values(this.#httpTransports).map(async (transport) => {
        try {
          await transport?.close();
          successCount++;
        } catch (error) {
          this.alert(`Error closing transport:`, error);
          errorCount++;
        }
      }),
    );
    this.info(`Closed ${successCount} transports, ${errorCount} errors`);

    // Close STDIO transport
    if (this.#stdioTransport) {
      try {
        await this.#stdioTransport.close();
        this.#stdioTransport = null;
        this.info("Closed STDIO transport");
      } catch (error) {
        this.error("Error closing STDIO transport:", error);
      }
    }

    // Close Express server
    if (this.#expressServer) {
      try {
        this.#expressServer.close();
        this.#expressServer = null;
        this.info("Closed Express server");
      } catch (error) {
        this.error("Error closing Express server:", error);
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
  const { app, transports }: ExpressResult = createExpressServer({
    hostname: config.hostname,
    port: config.port,
    staticDir: config.staticDir,
  }, server);

  // Create the app
  const result = new App({
    app,
    config,
    server,
    transports,
  });

  // Setup signal handlers
  setupSignalHandlers(result);

  // Log the configuration
  result.debug("Configuration:", {
    debug: config.debug,
    hasMemoryFilePath: !!config.memoryFilePath,
    hasStaticDir: !!config.staticDir,
    hostname: config.hostname,
    port: config.port,
  });

  return result;
}

export type { App };
