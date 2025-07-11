import type { Logger } from "./logger.ts";

export class SignalHandler {
  #onShutdown: () => Promise<void>;
  #logger: Logger;

  /** Handles shutdown signals gracefully */
  constructor(logger: Logger, onShutdown: () => Promise<void> = async () => {}) {
    this.#logger = logger;
    this.#onShutdown = onShutdown;
    this.#init();
  }

  #init(): void {
    // Handle beforeunload event
    globalThis.addEventListener("beforeunload", this.#onShutdown);

    // Handle uncaught exceptions
    globalThis.addEventListener("unhandledrejection", this.#handleError);

    // Handle SIGINT (Ctrl+C)
    Deno.addSignalListener("SIGINT", () => this.#handleSignal("SIGINT"));

    // Handle SIGTERM (Unix only)
    if (Deno.build.os !== "windows") {
      Deno.addSignalListener("SIGTERM", () => this.#handleSignal("SIGTERM"));
      Deno.addSignalListener("SIGHUP", () => this.#handleSignal("SIGHUP"));
    }
  }

  #handleError = async (): Promise<void> => {
    this.#logger.error("Unhandled rejection, shutting down gracefully...");
    await this.#onShutdown();
    Deno.exit(1);
  };

  #handleSignal = async (signal: string): Promise<void> => {
    this.#logger.info(`Received ${signal}, shutting down gracefully...`);
    await this.#onShutdown();
    Deno.exit(0);
  };
}
