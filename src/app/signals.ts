/** Sets up signal handlers for graceful shutdown; returns a disposer for tests and clean stop. */
export function setupSignalHandlers(onShutdown: () => Promise<void>): () => void {
  const handleExit = (code: number) => {
    onShutdown().finally(() => Deno.exit(code));
  };

  const onBeforeUnload = () => {
    void onShutdown();
  };

  const onUnhandledRejection = (_event: PromiseRejectionEvent) => {
    handleExit(1);
  };

  const onSigInt = () => handleExit(0);

  globalThis.addEventListener("beforeunload", onBeforeUnload);
  globalThis.addEventListener("unhandledrejection", onUnhandledRejection);

  Deno.addSignalListener("SIGINT", onSigInt);

  const extraListeners: { signal: Deno.Signal; handler: () => void }[] = [];
  for (const signal of ["SIGTERM", "SIGHUP"] as const) {
    const handler = () => handleExit(0);
    try {
      Deno.addSignalListener(signal, handler);
      extraListeners.push({ signal, handler });
    } catch {
      // ignore if unsupported on this platform
    }
  }

  return () => {
    globalThis.removeEventListener("beforeunload", onBeforeUnload);
    globalThis.removeEventListener("unhandledrejection", onUnhandledRejection);
    Deno.removeSignalListener("SIGINT", onSigInt);
    for (const { signal, handler } of extraListeners) {
      try {
        Deno.removeSignalListener(signal, handler);
      } catch {
        // ignore
      }
    }
  };
}
