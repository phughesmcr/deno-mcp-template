/**
 * In-process tracking for URL-mode MCP elicitation (completion notifiers + TTL).
 * @module
 */

export const URL_ELICITATION_TTL_MS = 60 * 60 * 1000;

export type UrlElicitationStatus = "pending" | "complete";

export interface UrlElicitationRecord {
  readonly sessionId: string;
  readonly label: string;
  readonly createdAt: number;
  status: UrlElicitationStatus;
  completionNotifier: () => Promise<void>;
}

export interface UrlElicitationRegistry {
  registerPending(entry: {
    elicitationId: string;
    sessionId: string;
    label: string;
    completionNotifier: () => Promise<void>;
  }): void;
  /** Returns the record when `elicitationId` exists and `sessionId` matches and status is pending. */
  getPendingForSession(elicitationId: string, sessionId: string): UrlElicitationRecord | undefined;
  /**
   * Idempotent: runs the notifier at most once.
   * The MCP SDK notifier signals that the elicitation flow finished; this demo does not distinguish
   * confirm vs cancel at the protocol level (see `registerUrlElicitationRoutes`).
   */
  complete(elicitationId: string): Promise<void>;
  /** Removes entries older than {@link URL_ELICITATION_TTL_MS}. Returns count removed. */
  cleanupExpired(now?: number): number;
}

export function createUrlElicitationRegistry(): UrlElicitationRegistry {
  const map = new Map<string, UrlElicitationRecord>();

  return {
    registerPending(entry) {
      map.set(entry.elicitationId, {
        sessionId: entry.sessionId,
        label: entry.label,
        createdAt: Date.now(),
        status: "pending",
        completionNotifier: entry.completionNotifier,
      });
    },

    getPendingForSession(elicitationId, sessionId) {
      const rec = map.get(elicitationId);
      if (!rec || rec.status !== "pending" || rec.sessionId !== sessionId) return undefined;
      return rec;
    },

    async complete(elicitationId) {
      const rec = map.get(elicitationId);
      if (!rec || rec.status === "complete") return;
      rec.status = "complete";
      try {
        await rec.completionNotifier();
      } catch (error) {
        console.error(`URL elicitation completion notifier failed for ${elicitationId}`, error);
      }
    },

    cleanupExpired(now = Date.now()) {
      const cutoff = now - URL_ELICITATION_TTL_MS;
      let removed = 0;
      for (const [id, rec] of map.entries()) {
        if (rec.createdAt < cutoff) {
          map.delete(id);
          removed += 1;
        }
      }
      return removed;
    },
  };
}
