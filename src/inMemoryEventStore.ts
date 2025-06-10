/**
 * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/2cf4f0ca86ff841aca53ac8ef5f3227ba3789386/src/examples/shared/inMemoryEventStore.ts#L9
 * @module
 */

import type { EventStore } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { JSONRPCMessage } from "../vendor/schema.ts";

type McpEvent = { streamId: string; message: JSONRPCMessage };
type McpEventSender = (eventId: string, message: JSONRPCMessage) => Promise<void>;

/**
 * Simple in-memory implementation of the EventStore interface for resumability
 * This is primarily intended for examples and testing, not for production use
 * where a persistent storage solution would be more appropriate.
 */
export class InMemoryEventStore implements EventStore {
  #events: Map<string, McpEvent> = new Map();

  /** Generates a unique event ID for a given stream ID */
  #generateEventId(streamId: string): string {
    return `${streamId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /** Extracts the stream ID from an event ID */
  #getStreamIdFromEventId(eventId: string): string {
    return eventId.split("_")[0] ?? "";
  }

  /**
   * Stores an event with a generated event ID
   * Implements EventStore.storeEvent
   */
  async storeEvent(streamId: string, message: JSONRPCMessage): Promise<string> {
    const eventId = this.#generateEventId(streamId);
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

    // Extract the stream ID from the event ID
    const streamId = this.#getStreamIdFromEventId(lastEventId);
    if (!streamId) {
      return "";
    }

    let foundLastEvent = false;

    // Sort events by eventId for chronological ordering
    const sortedEvents = [...this.#events.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [eventId, { streamId: eventStreamId, message }] of sortedEvents) {
      // Only include events from the same stream
      if (eventStreamId !== streamId) {
        continue;
      }

      // Start sending events after we find the lastEventId
      if (eventId === lastEventId) {
        foundLastEvent = true;
        continue;
      }

      if (foundLastEvent) {
        await send(eventId, message);
      }
    }
    return streamId;
  }
}
