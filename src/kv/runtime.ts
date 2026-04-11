/**
 * Process-scoped Deno KV handle (single open database, path invariants).
 * @module
 */

function normalizeKvPath(path?: string): string | undefined {
  if (!path) return undefined;
  const trimmed = path.trim();
  return trimmed.length ? trimmed : undefined;
}

export interface KvRuntime {
  /** Set the path used on next open; throws if KV is already open with a different path. */
  configurePath(path?: string): void;
  /** Configured path (after {@link configurePath}), if any. */
  getConfiguredPath(): string | undefined;
  /** Lazily open and return the shared `Deno.Kv`. */
  get(): Promise<Deno.Kv>;
  /** {@link configurePath} then {@link get}. */
  open(path?: string): Promise<Deno.Kv>;
  /** Close if open and reset internal state. */
  close(): Promise<void>;
}

/**
 * Default implementation backed by `Deno.openKv` (one in-flight open, same semantics as legacy `store.ts`).
 */
export function createProcessKvRuntime(): KvRuntime {
  let kvPromise: Promise<Deno.Kv> | null = null;
  let configuredKvPath: string | undefined;
  let openedKvPath: string | undefined;

  const configurePath = (path?: string): void => {
    const normalizedPath = normalizeKvPath(path);
    if (kvPromise && normalizedPath !== openedKvPath) {
      throw new Error(
        `Cannot change KV path while store is open. Current: ${
          openedKvPath ?? "<default>"
        }, requested: ${normalizedPath ?? "<default>"}.`,
      );
    }
    configuredKvPath = normalizedPath;
  };

  const getConfiguredPath = (): string | undefined => configuredKvPath;

  const get = async (): Promise<Deno.Kv> => {
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
  };

  const open = async (path?: string): Promise<Deno.Kv> => {
    if (path !== undefined) configurePath(path);
    return await get();
  };

  const close = async (): Promise<void> => {
    if (!kvPromise) return;
    const kv = await kvPromise;
    kv.close();
    kvPromise = null;
    openedKvPath = undefined;
  };

  return { configurePath, getConfiguredPath, get, open, close };
}

let processSingleton: KvRuntime | null = null;

/** Shared process KV runtime (same instance `store.ts` delegates to). */
export function getProcessKvRuntime(): KvRuntime {
  if (!processSingleton) processSingleton = createProcessKvRuntime();
  return processSingleton;
}
