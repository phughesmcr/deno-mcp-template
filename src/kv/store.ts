/**
 * @description Shared Deno KV lifecycle — delegates to {@link getProcessKvRuntime}.
 * @module
 */

import { getProcessKvRuntime } from "./runtime.ts";

/** Configures path on the shared {@link getProcessKvRuntime}. */
export function configureKvPath(path?: string): void {
  getProcessKvRuntime().configurePath(path);
}

/** Configures (optional) path and opens KV. */
export async function openKvStore(path?: string): Promise<Deno.Kv> {
  return await getProcessKvRuntime().open(path);
}

/** Closes the shared KV store if it is open. */
export async function closeKvStore(): Promise<void> {
  await getProcessKvRuntime().close();
}
