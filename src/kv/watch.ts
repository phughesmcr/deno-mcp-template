/**
 * @description Builds a {@link KvWatcher} around Deno KV’s `watch` API so callers can react when a
 * single key changes. Each logical subscription is keyed by a caller-supplied `uri` (one active watch
 * per `uri`); the first event from the stream is treated as the initial snapshot and is skipped so
 * callbacks only run on later updates. Watches use the same Deno KV opened by `getKvStore` in
 * `store.ts`.
 * @module
 */

import { getKvStore } from "./store.ts";

type WatchCallback = () => Promise<void> | void;

type WatchState = {
  reader: ReadableStreamDefaultReader<Deno.KvEntryMaybe<unknown>[]>;
  task: Promise<void>;
};

export interface KvWatcher {
  watch(uri: string, key: Deno.KvKey, onChange: WatchCallback): Promise<void>;
  unwatch(uri: string): Promise<void>;
  stop(): Promise<void>;
}

export function createKvWatcher(): KvWatcher {
  /** Map<uri, WatchState> */
  const states = new Map<string, WatchState>();

  const watch = async (uri: string, key: Deno.KvKey, onChange: WatchCallback): Promise<void> => {
    if (states.has(uri)) return;

    const kv = await getKvStore();
    const stream = kv.watch([key]);
    const reader = stream.getReader();

    const runWatchLoop = async (): Promise<void> => {
      let isFirstEvent = true;
      while (true) {
        const { done } = await reader.read();
        if (done) break;
        if (isFirstEvent) {
          // Ignore the initial snapshot event; only notify on subsequent updates.
          isFirstEvent = false;
          continue;
        }
        await onChange();
      }
    };

    const task = runWatchLoop().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("closed")) {
        console.error(`KV watcher for ${uri} failed`, error);
      }
    }).finally(() => {
      states.delete(uri);
      reader.releaseLock();
    });

    states.set(uri, { reader, task });
  };

  const unwatch = async (uri: string): Promise<void> => {
    const state = states.get(uri);
    if (!state) return;
    states.delete(uri);
    await state.reader.cancel();
    await state.task.catch(() => {});
  };

  const stop = async (): Promise<void> => {
    const uris = Array.from(states.keys());
    await Promise.allSettled(uris.map((uri) => unwatch(uri)));
  };

  return {
    watch,
    unwatch,
    stop,
  };
}
