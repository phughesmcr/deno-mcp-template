/** Sets up signal handlers for graceful shutdown */
export function setupSignalHandlers(onShutdown: () => Promise<void>): void {
  const handleError = async (): Promise<never> => {
    await onShutdown();
    Deno.exit(1);
  };

  const handleSignal = async (): Promise<never> => {
    await onShutdown();
    Deno.exit(0);
  };

  globalThis.addEventListener("beforeunload", onShutdown);
  globalThis.addEventListener("unhandledrejection", handleError);

  // Handle SIGINT (Ctrl+C)
  Deno.addSignalListener("SIGINT", handleSignal);

  // Handle SIGTERM (Unix only)
  try {
    Deno.addSignalListener("SIGTERM", handleSignal);
  } catch {
    // ignore if unsupported on this platform
  }
  try {
    Deno.addSignalListener("SIGHUP", handleSignal);
  } catch {
    // ignore if unsupported on this platform
  }
}
