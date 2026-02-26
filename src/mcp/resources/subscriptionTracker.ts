import { createKvWatcher, type KvWatcher } from "$/app/kv/mod.ts";
import { RESOURCE_KV_KEYS } from "./kvKeys.ts";

export type ResourceUpdateNotifier = (uri: string) => Promise<void>;

export interface ResourceSubscriptionTracker {
  register: (notifier: ResourceUpdateNotifier) => void;
  subscribe: (notifier: ResourceUpdateNotifier, uri: string) => Promise<void>;
  unsubscribe: (notifier: ResourceUpdateNotifier, uri: string) => Promise<void>;
  unregister: (notifier: ResourceUpdateNotifier) => Promise<void>;
  isSubscribed: (uri: string) => boolean;
  getSubscriptions: () => string[];
}

export function createResourceSubscriptionTracker(
  watcher: KvWatcher = createKvWatcher(),
): ResourceSubscriptionTracker {
  const subscriptionCounts = new Map<string, number>();
  const subscriptionsByNotifier = new Map<ResourceUpdateNotifier, Set<string>>();

  const isSubscribed = (uri: string): boolean => (subscriptionCounts.get(uri) ?? 0) > 0;

  const getSubscriptions = (): string[] => Array.from(subscriptionCounts.keys());

  const releaseUri = async (uri: string): Promise<void> => {
    const count = subscriptionCounts.get(uri);
    if (!count) return;
    if (count === 1) {
      subscriptionCounts.delete(uri);
      if (RESOURCE_KV_KEYS.has(uri)) {
        await watcher.unwatch(uri);
      }
      return;
    }
    subscriptionCounts.set(uri, count - 1);
  };

  const unregister = async (notifier: ResourceUpdateNotifier): Promise<void> => {
    const subscriptions = subscriptionsByNotifier.get(notifier);
    if (!subscriptions) return;
    subscriptionsByNotifier.delete(notifier);
    const uris = Array.from(subscriptions);
    await Promise.allSettled(uris.map((uri) => releaseUri(uri)));
  };

  const notifySubscribers = async (uri: string): Promise<void> => {
    const targets = Array.from(subscriptionsByNotifier.entries())
      .filter(([, subscriptions]) => subscriptions.has(uri));

    await Promise.allSettled(targets.map(async ([notifier]) => {
      try {
        await notifier(uri);
      } catch {
        await unregister(notifier);
      }
    }));
  };

  const retainUri = async (uri: string): Promise<void> => {
    const count = subscriptionCounts.get(uri) ?? 0;
    if (count === 0) {
      const key = RESOURCE_KV_KEYS.get(uri);
      if (key) {
        await watcher.watch(uri, key, async () => {
          if (!isSubscribed(uri)) return;
          await notifySubscribers(uri);
        });
      }
    }
    subscriptionCounts.set(uri, count + 1);
  };

  const register = (notifier: ResourceUpdateNotifier): void => {
    if (!subscriptionsByNotifier.has(notifier)) {
      subscriptionsByNotifier.set(notifier, new Set());
    }
  };

  const subscribe = async (
    notifier: ResourceUpdateNotifier,
    uri: string,
  ): Promise<void> => {
    register(notifier);
    const subscriptions = subscriptionsByNotifier.get(notifier)!;
    if (subscriptions.has(uri)) return;
    subscriptions.add(uri);
    await retainUri(uri);
  };

  const unsubscribe = async (
    notifier: ResourceUpdateNotifier,
    uri: string,
  ): Promise<void> => {
    const subscriptions = subscriptionsByNotifier.get(notifier);
    if (!subscriptions?.delete(uri)) return;
    await releaseUri(uri);
    if (subscriptions.size === 0) {
      subscriptionsByNotifier.delete(notifier);
    }
  };

  return {
    register,
    subscribe,
    unsubscribe,
    unregister,
    isSubscribed,
    getSubscriptions,
  };
}
