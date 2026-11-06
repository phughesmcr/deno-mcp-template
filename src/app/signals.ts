import { APP_NAME } from "$/shared/constants.ts";

/** Sets up signal handlers for graceful shutdown; returns a disposer for tests and clean stop. */
export function setupSignalHandlers(onShutdown: () => Promise<void>): () => void {
  const shutdown = () =>
    onShutdown().catch((error) => console.error(`${APP_NAME}: shutdown failed`, error));

  const handleExit = (code: number) => {
    shutdown().finally(() => Deno.exit(code));
  };

  /** `preventDefault` keeps the event loop running, which the shutdown needs to finish. */
  const onBeforeUnload = (event: Event) => {
    event.preventDefault();
    globalThis.removeEventListener("beforeunload", onBeforeUnload);
    void shutdown();
  };

  /** `preventDefault` stops Deno exiting at once, which would cut the shutdown short. */
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    event.preventDefault();
    console.error(`${APP_NAME}: unhandled rejection`, event.reason);
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
