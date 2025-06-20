/**
 * @description The main app for the MCP server
 * @module
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";

import { APP_NAME } from "../constants.ts";
import type { SessionRecord } from "../types.ts";
import { type AppConfig, getConfig } from "./config.ts";
import { createHttpServer, type ExpressApp } from "./express.ts";

interface AppSpec extends AppConfig {
  staticDir: string;
}

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

  // Handle SIGINT signal (Ctrl+C)
  Deno.addSignalListener("SIGINT", async (): Promise<void> => {
    app.alert("Received SIGINT, shutting down gracefully...");
    await app.stop();
    Deno.exit(0);
  });

  // Handle SIGTERM signal (process termination)
  if (Deno.build.os !== "windows") {
    Deno.addSignalListener("SIGTERM", async (): Promise<void> => {
      app.alert("Received SIGTERM, shutting down gracefully...");
      await app.stop();
      Deno.exit(0);
    });
  }
}

class App {
  /** The Express app for SSE and HTTP */
  #app: express.Application;

  /** The configuration for the app */
  #config: AppSpec;

  /** Whether the server is running */
  #running = false;

  /** The MCP server */
  #server: Server;

  /** The SSE transports */
  #sseTransports: SessionRecord;

  /** The STDIO transport */
  #stdioTransport: StdioServerTransport | null = null;

  /**
   * Creates a new App instance
   * @param server - The MCP server
   * @param config - The configuration for the app, defaults to the config from the CLI / env
   */
  constructor(server: Server, config: AppSpec, sseSpec: ExpressApp) {
    this.#server = server;
    this.#config = config;
    this.#sseTransports = sseSpec.transports;
    this.#app = sseSpec.app;
  }

  /** Sends a message to stderr regardless of debug logging */
  alert(message: string, ...args: unknown[]): void {
    console.error(message, ...args);
  }

  /** Sends a message to stderr only if debug logging is enabled */
  log(message: string, ...args: unknown[]): void {
    if (this.#config.enableDebugLogging) {
      console.error(message, ...args);
    }
  }

  /** Starts the server */
  async start(): Promise<void> {
    if (this.#running) { return; }

    // Start HTTP server
    const { hostname, port } = this.#config;
    this.#app.listen(port, hostname, () => {
      this.alert(`${APP_NAME} MCP server is listening on ${hostname}:${port}`);
    });

    // Setup STDIO transport
    this.#stdioTransport = new StdioServerTransport();
    await this.#server.connect(this.#stdioTransport);
    this.alert(`${APP_NAME} MCP server is listening on STDIO`);

    this.#running = true;
  }

  /** Stops the server */
  async stop(): Promise<void> {
    if (!this.#running) { return; }

    // Close all SSE transports
    let errorCount = 0;
    let successCount = 0;
    await Promise.allSettled(
      Object.entries(this.#sseTransports).map(async ([sessionId, transport]) => {
        try {
          await transport?.close();
          delete this.#sseTransports[sessionId];
          successCount++;
        } catch (error) {
          this.alert(`Error closing transport:`, error);
          errorCount++;
        }
      }),
    );
    this.log(`Closed ${successCount} transports, ${errorCount} errors`);

    // Close STDIO transport
    if (this.#stdioTransport) {
      try {
        await this.#stdioTransport.close();
        this.#stdioTransport = null;
        this.log("Closed STDIO transport");
      } catch (error) {
        this.alert("Error closing STDIO transport:", error);
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
export function createApp(server: Server, config: Partial<AppConfig> = {}): App {
  // Construct the config
  const spec = {
    ...getConfig(),
    ...config,
    staticDir: import.meta.dirname ?? "",
  };

  // Create HTTP server and get transports
  const expressServer = createHttpServer({
    hostname: spec.hostname,
    port: spec.port,
    staticDir: spec.staticDir,
  }, server);

  // Create the app
  const app = new App(server, spec, expressServer);

  // Setup signal handlers
  setupSignalHandlers(app);

  // Log the configuration
  app.log("Configuration:", {
    port: spec.port,
    hostname: spec.hostname,
    hasMemoryFilePath: !!spec.memoryFilePath,
    enableDebugLogging: spec.enableDebugLogging,
  });

  return app;
}

export type { App };
