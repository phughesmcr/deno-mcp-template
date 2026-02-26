import type { KvWatcher } from "$/app/kv/mod.ts";
import { createResourceSubscriptionTracker } from "$/mcp/resources/subscriptionTracker.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: expected ${String(expected)}, received ${String(actual)}`);
  }
}

type WatchCallback = () => Promise<void> | void;

class FakeWatcher implements KvWatcher {
  watchCalls: string[] = [];
  unwatchCalls: string[] = [];
  #callbacks = new Map<string, WatchCallback>();

  async watch(uri: string, _key: Deno.KvKey, onChange: WatchCallback): Promise<void> {
    this.watchCalls.push(uri);
    this.#callbacks.set(uri, onChange);
  }

  async unwatch(uri: string): Promise<void> {
    this.unwatchCalls.push(uri);
    this.#callbacks.delete(uri);
  }

  async stop(): Promise<void> {
    this.#callbacks.clear();
  }

  async trigger(uri: string): Promise<void> {
    const callback = this.#callbacks.get(uri);
    if (!callback) return;
    await callback();
  }
}

const COUNTER_URI = "counter://value";
const UNTRACKED_URI = "hello://world";

Deno.test("subscription tracker keeps shared URI active until last subscriber leaves", async () => {
  const watcher = new FakeWatcher();
  const tracker = createResourceSubscriptionTracker(watcher);

  let aUpdates = 0;
  let bUpdates = 0;
  const notifyA = async (_uri: string): Promise<void> => {
    aUpdates += 1;
  };
  const notifyB = async (_uri: string): Promise<void> => {
    bUpdates += 1;
  };

  await tracker.subscribe(notifyA, COUNTER_URI);
  await tracker.subscribe(notifyB, COUNTER_URI);

  assertEquals(watcher.watchCalls.length, 1);
  assertEquals(watcher.watchCalls[0], COUNTER_URI);
  assert(tracker.isSubscribed(COUNTER_URI), "Expected URI to be marked as subscribed");

  await tracker.unsubscribe(notifyA, COUNTER_URI);
  assertEquals(watcher.unwatchCalls.length, 0);
  await watcher.trigger(COUNTER_URI);
  assertEquals(aUpdates, 0);
  assertEquals(bUpdates, 1);

  await tracker.unsubscribe(notifyB, COUNTER_URI);
  assertEquals(watcher.unwatchCalls.length, 1);
  assertEquals(watcher.unwatchCalls[0], COUNTER_URI);
  assert(!tracker.isSubscribed(COUNTER_URI), "Expected URI to be released after last unsubscribe");
});

Deno.test("subscription tracker only notifies subscribers of matching URIs", async () => {
  const watcher = new FakeWatcher();
  const tracker = createResourceSubscriptionTracker(watcher);

  let counterUpdates = 0;
  let helloUpdates = 0;
  const counterNotifier = async (_uri: string): Promise<void> => {
    counterUpdates += 1;
  };
  const helloNotifier = async (_uri: string): Promise<void> => {
    helloUpdates += 1;
  };

  await tracker.subscribe(counterNotifier, COUNTER_URI);
  await tracker.subscribe(helloNotifier, UNTRACKED_URI);

  await watcher.trigger(COUNTER_URI);
  assertEquals(counterUpdates, 1);
  assertEquals(helloUpdates, 0);
});

Deno.test("subscription tracker drops failing notifiers without affecting others", async () => {
  const watcher = new FakeWatcher();
  const tracker = createResourceSubscriptionTracker(watcher);

  let healthyUpdates = 0;
  const failingNotifier = async (_uri: string): Promise<void> => {
    throw new Error("simulated closed transport");
  };
  const healthyNotifier = async (_uri: string): Promise<void> => {
    healthyUpdates += 1;
  };

  await tracker.subscribe(failingNotifier, COUNTER_URI);
  await tracker.subscribe(healthyNotifier, COUNTER_URI);
  assertEquals(watcher.watchCalls.length, 1);

  await watcher.trigger(COUNTER_URI);
  assertEquals(healthyUpdates, 1);
  assert(
    tracker.isSubscribed(COUNTER_URI),
    "Expected healthy subscription to remain after notifier failure",
  );

  await tracker.unsubscribe(healthyNotifier, COUNTER_URI);
  assertEquals(watcher.unwatchCalls.length, 1);
  assertEquals(watcher.unwatchCalls[0], COUNTER_URI);
});
