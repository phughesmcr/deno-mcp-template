/**
 * @description Builds a {@link KvWatcher} around Deno KV’s `watch` API so callers can react when a
 * single key changes. Each logical subscription is keyed by a caller-supplied `uri` (one active watch
 * per `uri`). `watch()` resolves once the initial snapshot has been read, so callbacks run only for
 * later updates, and a callback that throws is logged without ending the watch.
 * @module
 */

import type { KvRuntime } from "./runtime.ts";

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

export function createKvWatcher(rt: KvRuntime): KvWatcher {
  /** Map<uri, WatchState> */
  const states = new Map<string, WatchState>();
  /** Serialize concurrent `watch(uri)` so only one KV watch stream is created per `uri`. */
  const inflightSetup = new Map<string, Promise<void>>();

  const watch = async (uri: string, key: Deno.KvKey, onChange: WatchCallback): Promise<void> => {
    if (states.has(uri)) return;

    let setup = inflightSetup.get(uri);
    if (!setup) {
      setup = (async () => {
        const kv = await rt.get();
        if (states.has(uri)) return;

        const reader = kv.watch([key]).getReader();
        // The first event is the current value: only later updates notify.
        await reader.read();

        const runWatchLoop = async (): Promise<void> => {
          while (!(await reader.read()).done) {
            try {
              await onChange();
            } catch (error) {
              console.error(`KV watcher callback for ${uri} failed`, error);
            }
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
      })().finally(() => {
        inflightSetup.delete(uri);
      });
      inflightSetup.set(uri, setup);
    }

    await setup;
  };

  const unwatch = async (uri: string): Promise<void> => {
    const pending = inflightSetup.get(uri);
    if (pending) {
      await pending.catch(() => {});
    }
    const state = states.get(uri);
    if (!state) return;
    states.delete(uri);
    await state.reader.cancel();
    await state.task.catch(() => {});
  };

  const stop = async (): Promise<void> => {
    const uris = new Set([...states.keys(), ...inflightSetup.keys()]);
    await Promise.allSettled([...uris].map((uri) => unwatch(uri)));
  };

  return {
    watch,
    unwatch,
    stop,
  };
}
