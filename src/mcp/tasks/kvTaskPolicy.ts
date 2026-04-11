/**
 * Pure task policy helpers (TTL clamp, session visibility, expiry) — no KV I/O.
 * @module
 */

import type { Task } from "@modelcontextprotocol/sdk/types.js";

type TaskMetaRecord = {
  task: Task;
  sessionId?: string;
  expiresAt?: number;
};

/** Session-bound tasks are invisible to `getTask` / `getTaskResult` unless `sessionId` matches. */
export function canReadTaskForSession(record: TaskMetaRecord, sessionId?: string): boolean {
  if (record.sessionId === undefined) return true;
  return sessionId !== undefined && record.sessionId === sessionId;
}

export function toExpiry(ttl: number | null | undefined): number | undefined {
  return ttl && ttl > 0 ? ttl : undefined;
}

export function clampRequestedTtl(requested: number | null, maxMs?: number): number | null {
  if (requested === null || maxMs === undefined) return requested;
  return requested > maxMs ? maxMs : requested;
}

export function nextTimestamp(): string {
  return new Date().toISOString();
}

export function cloneTask(task: Task): Task {
  return { ...task };
}

export function getRemainingExpiry(record: TaskMetaRecord): number | undefined {
  if (!record.expiresAt) return undefined;
  const remaining = record.expiresAt - Date.now();
  return remaining > 0 ? remaining : 1;
}
