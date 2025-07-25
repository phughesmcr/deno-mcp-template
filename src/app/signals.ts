import type { Logger } from "./logger.ts";

/** Sets up signal handlers for graceful shutdown */
export function setupSignalHandlers(onShutdown: () => Promise<void>, logger: Logger): void {
  const handleError = async (): Promise<never> => {
    logger.debug({
      data: { message: "Unhandled rejection received, initiating emergency shutdown" },
    });
    await onShutdown();
    Deno.exit(1);
  };

  const handleSignal = async (signal: string): Promise<never> => {
    logger.debug({
      data: { message: `Received ${signal} signal, initiating shutdown` },
    });
    await onShutdown();
    Deno.exit(0);
  };

  globalThis.addEventListener("beforeunload", onShutdown);
  globalThis.addEventListener("unhandledrejection", handleError);

  // Handle SIGINT (Ctrl+C)
  Deno.addSignalListener("SIGINT", () => handleSignal("SIGINT"));

  // Handle SIGTERM (Unix only)
  if (Deno.build.os !== "windows") {
    Deno.addSignalListener("SIGTERM", () => handleSignal("SIGTERM"));
    Deno.addSignalListener("SIGHUP", () => handleSignal("SIGHUP"));
  }
}
