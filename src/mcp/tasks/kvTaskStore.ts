import type {
  CreateTaskOptions,
  TaskStore,
} from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import { isTerminal } from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import type { Request, RequestId, Result, Task } from "@modelcontextprotocol/sdk/types.js";

import { getProcessKvRuntime } from "$/kv/mod.ts";
import type { KvRuntime } from "$/kv/runtime.ts";
import {
  canReadTaskForSession,
  clampRequestedTtl,
  cloneTask,
  getRemainingExpiry,
  nextTimestamp,
  toExpiry,
} from "$/mcp/tasks/kvTaskPolicy.ts";

const PAGE_SIZE = 10;
const MAX_CONCURRENCY_RETRIES = 5;

export const TASK_META_PREFIX = ["task", "meta"] as const;
const TASK_RESULT_PREFIX = ["task", "result"] as const;

/** Secondary index: working tasks ordered by `lastUpdatedAt` (ISO) for bounded stale cleanup. */
export const TASK_WORKING_PREFIX = ["task", "working"] as const;
const WORKING_INDEX_MIGRATED_KEY = ["task", "maintenance", "working_index_migrated"] as const;

/** KV key for the working-task index row (used by maintenance cron). */
export function createWorkingIndexKey(lastUpdatedAt: string, taskId: string): Deno.KvKey {
  return [...TASK_WORKING_PREFIX, lastUpdatedAt, taskId];
}

type TaskMetaRecord = {
  task: Task;
  requestId: RequestId;
  request: Request;
  sessionId?: string;
  expiresAt?: number;
};

export type KvTaskStoreOptions = {
  /**
   * When set, positive client-requested TTL values are clamped to this ceiling.
   * The returned `Task.ttl` reflects the effective value (per MCP `TaskStore`).
   */
  maxTtlMs?: number;
  /** KV handle; defaults to {@link getProcessKvRuntime}. */
  kv?: KvRuntime;
};

/** KV key for task metadata (`TaskMetaRecord`). Shared with task message queue TTL alignment. */
export function createTaskMetaKey(taskId: string): Deno.KvKey {
  return [...TASK_META_PREFIX, taskId];
}

function createTaskResultKey(taskId: string): Deno.KvKey {
  return [...TASK_RESULT_PREFIX, taskId];
}

function withOptionalExpiry<T>(
  atomic: Deno.AtomicOperation,
  key: Deno.KvKey,
  value: T,
  expireIn?: number,
): Deno.AtomicOperation {
  return expireIn ? atomic.set(key, value, { expireIn }) : atomic.set(key, value);
}

/**
 * One-time rebuild of the working-task index from task metadata (handles upgrades and meta drift).
 * Safe to call on every process start; runs the heavy work only until the marker key is set.
 */
export async function migrateWorkingTaskIndexIfNeeded(kvRuntime?: KvRuntime): Promise<void> {
  const runtime = kvRuntime ?? getProcessKvRuntime();
  const kvdb = await runtime.get();
  const marker = await kvdb.get(WORKING_INDEX_MIGRATED_KEY);
  if (marker.value) return;

  const keysToDelete: Deno.KvKey[] = [];
  for await (const entry of kvdb.list({ prefix: [...TASK_WORKING_PREFIX] })) {
    keysToDelete.push(entry.key);
  }
  for (const key of keysToDelete) {
    await kvdb.delete(key);
  }

  for await (const entry of kvdb.list<TaskMetaRecord>({ prefix: TASK_META_PREFIX })) {
    const rec = entry.value;
    if (!rec?.task || rec.task.status !== "working") continue;
    const expireIn = getRemainingExpiry(rec);
    const wk = createWorkingIndexKey(rec.task.lastUpdatedAt, rec.task.taskId);
    if (expireIn) {
      await kvdb.set(wk, { taskId: rec.task.taskId }, { expireIn });
    } else {
      await kvdb.set(wk, { taskId: rec.task.taskId });
    }
  }

  await kvdb.set(WORKING_INDEX_MIGRATED_KEY, true);
}

type TaskMetaEntry = Deno.KvEntryMaybe<TaskMetaRecord>;

function getMetaEntry(kv: Deno.Kv, taskId: string): Promise<TaskMetaEntry> {
  return kv.get<TaskMetaRecord>(createTaskMetaKey(taskId));
}

export class KvTaskStore implements TaskStore {
  readonly #maxTtlMs: number | undefined;
  readonly #kv: KvRuntime;

  constructor(options?: KvTaskStoreOptions) {
    this.#maxTtlMs = options?.maxTtlMs;
    this.#kv = options?.kv ?? getProcessKvRuntime();
  }

  async #getKv(): Promise<Deno.Kv> {
    return await this.#kv.get();
  }

  async createTask(
    taskParams: CreateTaskOptions,
    requestId: RequestId,
    request: Request,
    sessionId?: string,
  ): Promise<Task> {
    const kv = await this.#getKv();
    const createdAt = nextTimestamp();
    const actualTtl = clampRequestedTtl(taskParams.ttl ?? null, this.#maxTtlMs);
    const ttlForExpiry = toExpiry(actualTtl);
    const expiresAt = ttlForExpiry ? Date.now() + ttlForExpiry : undefined;

    const taskId = crypto.randomUUID();
    const task: Task = {
      taskId,
      status: "working",
      ttl: actualTtl,
      createdAt,
      lastUpdatedAt: createdAt,
      pollInterval: taskParams.pollInterval ?? 1000,
    };
    const record: TaskMetaRecord = {
      task,
      requestId,
      request,
      sessionId,
      expiresAt,
    };
    let atomic = kv.atomic().check({ key: createTaskMetaKey(taskId), versionstamp: null });
    atomic = withOptionalExpiry(atomic, createTaskMetaKey(taskId), record, ttlForExpiry);
    atomic = withOptionalExpiry(
      atomic,
      createWorkingIndexKey(task.lastUpdatedAt, taskId),
      { taskId },
      ttlForExpiry,
    );

    const result = await atomic.commit();
    if (!result.ok) throw new Error("Failed to create task");
    return cloneTask(task);
  }

  async getTask(taskId: string, sessionId?: string): Promise<Task | null> {
    const kv = await this.#getKv();
    const entry = await getMetaEntry(kv, taskId);
    if (!entry.value) return null;
    if (!canReadTaskForSession(entry.value, sessionId)) return null;
    return cloneTask(entry.value.task);
  }

  async storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: Result,
    _sessionId?: string,
  ): Promise<void> {
    const kv = await this.#getKv();
    const taskMetaKey = createTaskMetaKey(taskId);
    const taskResultKey = createTaskResultKey(taskId);
    for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt++) {
      const entry = await getMetaEntry(kv, taskId);
      const record = entry.value;
      if (!record) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      if (isTerminal(record.task.status)) {
        throw new Error(
          `Cannot store result for task ${taskId} in terminal status '${record.task.status}'.`,
        );
      }

      const updatedTask: Task = {
        ...record.task,
        status,
        lastUpdatedAt: nextTimestamp(),
      };

      const resetExpiry = toExpiry(updatedTask.ttl);
      const expiresAt = resetExpiry ? Date.now() + resetExpiry : undefined;
      const updatedRecord: TaskMetaRecord = {
        ...record,
        task: updatedTask,
        expiresAt,
      };
      const versionstamp = entry.versionstamp;
      if (!versionstamp) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      let atomic = kv.atomic().check({ key: taskMetaKey, versionstamp });
      if (record.task.status === "working") {
        atomic = atomic.delete(createWorkingIndexKey(record.task.lastUpdatedAt, taskId));
      }
      atomic = withOptionalExpiry(
        atomic,
        taskMetaKey,
        updatedRecord,
        resetExpiry,
      );
      atomic = withOptionalExpiry(
        atomic,
        taskResultKey,
        result,
        resetExpiry,
      );
      const commitResult = await atomic.commit();
      if (commitResult.ok) {
        return;
      }
    }

    throw new Error(`Failed to store task result for ${taskId} due to concurrent updates`);
  }

  async getTaskResult(taskId: string, sessionId?: string): Promise<Result> {
    const kv = await this.#getKv();
    const metaKey = createTaskMetaKey(taskId);
    const resultKey = createTaskResultKey(taskId);
    const entries = await kv.getMany([metaKey, resultKey]);
    const taskEntry = entries[0]!;
    const resultEntry = entries[1]!;
    const meta = taskEntry.value as TaskMetaRecord | null;
    if (!meta) {
      throw new Error(`Task with ID ${taskId} not found`);
    }
    if (!canReadTaskForSession(meta, sessionId)) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    if (!resultEntry.value) {
      throw new Error(`Task ${taskId} has no result stored`);
    }
    return resultEntry.value as Result;
  }

  async updateTaskStatus(
    taskId: string,
    status: Task["status"],
    statusMessage?: string,
    _sessionId?: string,
  ): Promise<void> {
    const kv = await this.#getKv();
    const taskMetaKey = createTaskMetaKey(taskId);
    for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt++) {
      const entry = await getMetaEntry(kv, taskId);
      const record = entry.value;
      if (!record) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      if (isTerminal(record.task.status)) {
        throw new Error(
          `Cannot update task ${taskId} from terminal status '${record.task.status}' to '${status}'.`,
        );
      }

      const updatedTask: Task = {
        ...record.task,
        status,
        lastUpdatedAt: nextTimestamp(),
        ...(statusMessage ? { statusMessage } : {}),
      };

      let expiresAt = record.expiresAt;
      let expireIn = getRemainingExpiry(record);
      if (isTerminal(status)) {
        const ttl = toExpiry(updatedTask.ttl);
        expiresAt = ttl ? Date.now() + ttl : undefined;
        expireIn = ttl;
      }

      const updatedRecord: TaskMetaRecord = {
        ...record,
        task: updatedTask,
        expiresAt,
      };
      const versionstamp = entry.versionstamp;
      if (!versionstamp) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      let atomic = kv.atomic().check({ key: taskMetaKey, versionstamp });
      if (record.task.status === "working") {
        atomic = atomic.delete(createWorkingIndexKey(record.task.lastUpdatedAt, taskId));
      }
      atomic = withOptionalExpiry(atomic, taskMetaKey, updatedRecord, expireIn);
      if (updatedTask.status === "working") {
        atomic = withOptionalExpiry(
          atomic,
          createWorkingIndexKey(updatedTask.lastUpdatedAt, taskId),
          { taskId },
          expireIn,
        );
      }
      const commitResult = await atomic.commit();
      if (commitResult.ok) {
        return;
      }
    }

    throw new Error(`Failed to update task ${taskId} due to concurrent updates`);
  }

  /**
   * Paginates in KV key order (not necessarily creation order). `cursor` / `nextCursor` are opaque;
   * not filtered by `sessionId`.
   */
  async listTasks(
    cursor?: string,
    _sessionId?: string,
  ): Promise<{ tasks: Task[]; nextCursor?: string }> {
    const kv = await this.#getKv();
    const tasks: Task[] = [];
    const iterator = kv.list<TaskMetaRecord>(
      { prefix: TASK_META_PREFIX },
      { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
    );

    for await (const entry of iterator) {
      const task = entry.value?.task;
      if (task) {
        tasks.push(cloneTask(task));
      }
    }
    const nextCursor = tasks.length === PAGE_SIZE ? iterator.cursor : undefined;

    return {
      tasks,
      nextCursor,
    };
  }
}
