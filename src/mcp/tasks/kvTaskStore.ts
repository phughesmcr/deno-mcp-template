import type {
  CreateTaskOptions,
  TaskStore,
} from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import { isTerminal } from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import type { Request, RequestId, Result, Task } from "@modelcontextprotocol/sdk/types.js";

import { getKvStore } from "$/app/kv/mod.ts";

const PAGE_SIZE = 10;
const MAX_CONCURRENCY_RETRIES = 5;

export const TASK_META_PREFIX = ["task", "meta"] as const;
const TASK_RESULT_PREFIX = ["task", "result"] as const;

type TaskMetaRecord = {
  task: Task;
  requestId: RequestId;
  request: Request;
  sessionId?: string;
  expiresAt?: number;
};

function toExpiry(ttl: number | null | undefined): number | undefined {
  return ttl && ttl > 0 ? ttl : undefined;
}

function cloneTask(task: Task): Task {
  return {
    ...task,
  };
}

function nextTimestamp(): string {
  return new Date().toISOString();
}

function createTaskMetaKey(taskId: string): Deno.KvKey {
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

function getRemainingExpiry(record: TaskMetaRecord): number | undefined {
  if (!record.expiresAt) return undefined;
  const remaining = record.expiresAt - Date.now();
  return remaining > 0 ? remaining : 1;
}

type TaskMetaEntry = Deno.KvEntryMaybe<TaskMetaRecord>;

async function getMetaEntry(kv: Deno.Kv, taskId: string): Promise<TaskMetaEntry> {
  return await kv.get<TaskMetaRecord>(createTaskMetaKey(taskId));
}

export class KvTaskStore implements TaskStore {
  async createTask(
    taskParams: CreateTaskOptions,
    requestId: RequestId,
    request: Request,
    sessionId?: string,
  ): Promise<Task> {
    const kv = await getKvStore();
    const createdAt = nextTimestamp();
    const actualTtl = taskParams.ttl ?? null;
    const ttlForExpiry = toExpiry(actualTtl);
    const expiresAt = ttlForExpiry ? Date.now() + ttlForExpiry : undefined;

    for (let attempt = 0; attempt < 5; attempt++) {
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
      const commit = withOptionalExpiry(
        kv.atomic().check({ key: createTaskMetaKey(taskId), versionstamp: null }),
        createTaskMetaKey(taskId),
        record,
        ttlForExpiry,
      );

      const result = await commit.commit();
      if (result.ok) {
        return cloneTask(task);
      }
    }

    throw new Error("Failed to create unique task after multiple attempts");
  }

  async getTask(taskId: string, _sessionId?: string): Promise<Task | null> {
    const kv = await getKvStore();
    const entry = await getMetaEntry(kv, taskId);
    return entry.value ? cloneTask(entry.value.task) : null;
  }

  async storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: Result,
    _sessionId?: string,
  ): Promise<void> {
    const kv = await getKvStore();
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

  async getTaskResult(taskId: string, _sessionId?: string): Promise<Result> {
    const kv = await getKvStore();
    const taskEntry = await getMetaEntry(kv, taskId);
    if (!taskEntry.value) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const result = await kv.get<Result>(createTaskResultKey(taskId));
    if (!result.value) {
      throw new Error(`Task ${taskId} has no result stored`);
    }
    return result.value;
  }

  async updateTaskStatus(
    taskId: string,
    status: Task["status"],
    statusMessage?: string,
    _sessionId?: string,
  ): Promise<void> {
    const kv = await getKvStore();
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

      const commitResult = await withOptionalExpiry(
        kv.atomic().check({ key: taskMetaKey, versionstamp }),
        taskMetaKey,
        updatedRecord,
        expireIn,
      ).commit();
      if (commitResult.ok) {
        return;
      }
    }

    throw new Error(`Failed to update task ${taskId} due to concurrent updates`);
  }

  async listTasks(
    cursor?: string,
    _sessionId?: string,
  ): Promise<{ tasks: Task[]; nextCursor?: string }> {
    const kv = await getKvStore();
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
