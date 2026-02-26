/**
 * @description Shared Deno KV lifecycle management
 * @module
 */

let kvPromise: Promise<Deno.Kv> | null = null;
let configuredKvPath: string | undefined;
let openedKvPath: string | undefined;

function normalizeKvPath(path?: string): string | undefined {
  if (!path) return undefined;
  const trimmed = path.trim();
  return trimmed.length ? trimmed : undefined;
}

/**
 * Sets the KV path that should be used when opening Deno KV.
 * If KV is already open, only the same path is allowed.
 */
export function configureKvPath(path?: string): void {
  const normalizedPath = normalizeKvPath(path);
  if (kvPromise && normalizedPath !== openedKvPath) {
    throw new Error(
      `Cannot change KV path while store is open. Current: ${
        openedKvPath ?? "<default>"
      }, requested: ${normalizedPath ?? "<default>"}.`,
    );
  }
  configuredKvPath = normalizedPath;
}

/** Returns the configured KV path if one is set. */
export function getConfiguredKvPath(): string | undefined {
  return configuredKvPath;
}

/** Opens the shared KV store if needed and returns it. */
export async function getKvStore(): Promise<Deno.Kv> {
  if (!kvPromise) {
    const path = configuredKvPath;
    kvPromise = Deno.openKv(path)
      .then((kv) => {
        openedKvPath = path;
        return kv;
      })
      .catch((error) => {
        kvPromise = null;
        throw error;
      });
  }
  return await kvPromise;
}

/** Configures (optional) path and opens KV. */
export async function openKvStore(path?: string): Promise<Deno.Kv> {
  configureKvPath(path);
  return await getKvStore();
}

/** Closes the shared KV store if it is open. */
export async function closeKvStore(): Promise<void> {
  if (!kvPromise) return;
  const kv = await kvPromise;
  kv.close();
  kvPromise = null;
  openedKvPath = undefined;
}
