/**
 * @description Shared Deno KV lifecycle — delegates to {@link getProcessKvRuntime}.
 * @module
 */

import { getProcessKvRuntime } from "./runtime.ts";

/** Configures path on the shared {@link getProcessKvRuntime}. */
export function configureKvPath(path?: string): void {
  getProcessKvRuntime().configurePath(path);
}

/** Returns the configured KV path if one is set. */
export function getConfiguredKvPath(): string | undefined {
  return getProcessKvRuntime().getConfiguredPath();
}

/** Opens the shared KV store if needed and returns it. */
export async function getKvStore(): Promise<Deno.Kv> {
  return await getProcessKvRuntime().get();
}

/** Configures (optional) path and opens KV. */
export async function openKvStore(path?: string): Promise<Deno.Kv> {
  return await getProcessKvRuntime().open(path);
}

/** Closes the shared KV store if it is open. */
export async function closeKvStore(): Promise<void> {
  await getProcessKvRuntime().close();
}
