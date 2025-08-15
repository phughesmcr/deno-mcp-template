/**
 * @description A simple implementation of the EventStore interface for resumability using Deno KV
 * @see {@link https://github.com/modelcontextprotocol/typescript-sdk/blob/2cf4f0ca86ff841aca53ac8ef5f3227ba3789386/src/examples/shared/inMemoryEventStore.ts}
 * @module
 */

import type { EventStore } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { monotonicUlid } from "@std/ulid";

import { EVENT_EXPIRY } from "$/shared/constants/http.ts";

/** An event in the MCP event stream */
type McpEvent = { streamId: string; message: JSONRPCMessage; id: string };

/** A function to send an event to the MCP event stream */
type McpEventSender = (eventId: string, message: JSONRPCMessage) => Promise<void>;

/** A function to send an event to the MCP event stream */
type Sender = { send: McpEventSender };

/** The key for the events bucket */
const EVENTS_KEY = ["events"];

export class KvEventStore implements EventStore {
  #kv: Deno.Kv;

  static async create(kvPath?: string) {
    const kv = kvPath ? await Deno.openKv(kvPath) : await Deno.openKv();
    return new KvEventStore(kv);
  }

  constructor(kv: Deno.Kv) {
    this.#kv = kv;
  }

  /** Closes the underlying Deno.Kv instance */
  close(): void {
    try {
      this.#kv.close();
    } catch {
      // ignore errors during close
    }
  }

  /** Stores an event with a generated event ID */
  async storeEvent(streamId: string, message: JSONRPCMessage): Promise<string> {
    const eventId = `${streamId}_${monotonicUlid()}`;
    const key = [...EVENTS_KEY, streamId, eventId];
    const value: McpEvent = { streamId, message, id: eventId };
    await this.#kv.set(key, value, { expireIn: EVENT_EXPIRY });
    return eventId;
  }

  /** Gets an event by its ID */
  async getEvent(eventId: string): Promise<McpEvent | null> {
    const streamId = eventId.split("_")[0] ?? "";
    if (!streamId) return null;
    const key = [...EVENTS_KEY, streamId, eventId];
    const event = await this.#kv.get(key);
    if (!event.value) return null;
    return event.value as McpEvent;
  }

  /** Gets all events for a stream */
  async getStreamEvents(streamId: string): Promise<McpEvent[]> {
    const events: McpEvent[] = [];
    const prefix = [...EVENTS_KEY, streamId];

    for await (const entry of this.#kv.list({ prefix })) {
      if (entry.value) {
        events.push(entry.value as McpEvent);
      }
    }

    return events;
  }

  /** Replays events that occurred after a specific event ID */
  async replayEventsAfter(lastEventId: string, { send }: Sender): Promise<string> {
    if (!lastEventId) {
      return "";
    }

    const streamId = lastEventId.split("_")[0] ?? "";
    if (!streamId) {
      return "";
    }

    // Verify the lastEventId exists
    const lastEvent = await this.getEvent(lastEventId);
    if (!lastEvent) {
      return "";
    }

    // Get all events for this stream, sorted chronologically by event ID
    const streamEvents = (await this.getStreamEvents(streamId))
      .sort((a, b) => a.id.localeCompare(b.id));

    // Find position of lastEventId and get all events after it
    const lastEventIndex = streamEvents.findIndex((event) => event.id === lastEventId);
    if (lastEventIndex === -1) {
      return streamId; // Event not found in stream, but stream exists
    }

    // Send all events after the lastEventId
    const eventsToReplay = streamEvents.slice(lastEventIndex + 1);
    for (const { id, message } of eventsToReplay) {
      await send(id, message);
    }

    return streamId;
  }
}
