/** Sets up signal handlers for graceful shutdown */
export function setupSignalHandlers(onShutdown: () => Promise<void>): void {
  const handleExit = (code: number) => {
    onShutdown().finally(() => Deno.exit(code));
  };

  globalThis.addEventListener("beforeunload", () => {
    onShutdown();
  });

  globalThis.addEventListener("unhandledrejection", (_event) => {
    handleExit(1);
  });

  // Handle SIGINT (Ctrl+C)
  Deno.addSignalListener("SIGINT", () => handleExit(0));

  // Handle SIGTERM and SIGHUP (Unix only)
  for (const signal of ["SIGTERM", "SIGHUP"] as const) {
    try {
      Deno.addSignalListener(signal, () => handleExit(0));
    } catch {
      // ignore if unsupported on this platform
    }
  }

  // Handle stream closure errors gracefully (e.g., when SSE client disconnects)
  globalThis.addEventListener("error", (event) => {
    if (
      event.error instanceof TypeError &&
      event.error.message.includes("stream controller cannot close or enqueue")
    ) {
      // Suppress stream closure errors - these occur when clients disconnect
      event.preventDefault();
      return;
    }
  });
}
