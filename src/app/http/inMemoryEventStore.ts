/**
 * @description A simple in-memory implementation of the EventStore interface for resumability
 * @see {@link https://github.com/modelcontextprotocol/typescript-sdk/blob/2cf4f0ca86ff841aca53ac8ef5f3227ba3789386/src/examples/shared/inMemoryEventStore.ts#L9}
 * @module
 */

import type { EventStore } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

import type { McpEvent, McpEventSender } from "$/types.ts";

export class InMemoryEventStore implements EventStore {
  #events: Map<string, McpEvent>;

  /**
   * Simple in-memory implementation of the EventStore interface for resumability
   * This is primarily intended for examples and testing, not for production use
   * where a persistent storage solution would be more appropriate.
   */
  constructor() {
    this.#events = new Map();
  }

  /**
   * Stores an event with a generated event ID
   * Implements EventStore.storeEvent
   */
  async storeEvent(streamId: string, message: JSONRPCMessage): Promise<string> {
    const eventId = `${streamId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    this.#events.set(eventId, { streamId, message });
    return eventId;
  }

  /**
   * Replays events that occurred after a specific event ID
   * Implements EventStore.replayEventsAfter
   */
  async replayEventsAfter(
    lastEventId: string,
    { send }: { send: McpEventSender },
  ): Promise<string> {
    if (!lastEventId || !this.#events.has(lastEventId)) {
      return "";
    }

    const streamId = lastEventId.split("_")[0] ?? "";
    if (!streamId) {
      return "";
    }

    // Get all events for this stream, sorted chronologically
    const streamEvents = [...this.#events.entries()]
      .filter(([_, event]) => event.streamId === streamId)
      .sort(([a], [b]) => a.localeCompare(b));

    // Find position of lastEventId and get all events after it
    const lastEventIndex = streamEvents.findIndex(([eventId]) => eventId === lastEventId);
    if (lastEventIndex === -1) {
      return streamId; // Event not found in stream, but stream exists
    }

    // Send all events after the lastEventId
    const eventsToReplay = streamEvents.slice(lastEventIndex + 1);
    for (const [eventId, { message }] of eventsToReplay) {
      await send(eventId, message);
    }

    return streamId;
  }
}
