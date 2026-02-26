import type {
  CreateTaskOptions,
  TaskStore,
} from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import { isTerminal } from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import type { Request, RequestId, Result, Task } from "@modelcontextprotocol/sdk/types.js";

import { getKvStore } from "$/app/kv/mod.ts";

const PAGE_SIZE = 10;

const TASK_META_PREFIX = ["task", "meta"] as const;
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

async function getMetaRecord(kv: Deno.Kv, taskId: string): Promise<TaskMetaRecord | null> {
  const entry = await kv.get<TaskMetaRecord>(createTaskMetaKey(taskId));
  return entry.value ?? null;
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
    const record = await getMetaRecord(kv, taskId);
    return record ? cloneTask(record.task) : null;
  }

  async storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: Result,
    _sessionId?: string,
  ): Promise<void> {
    const kv = await getKvStore();
    const record = await getMetaRecord(kv, taskId);
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

    let atomic = kv.atomic();
    atomic = withOptionalExpiry(
      atomic,
      createTaskMetaKey(taskId),
      updatedRecord,
      resetExpiry,
    );
    atomic = withOptionalExpiry(
      atomic,
      createTaskResultKey(taskId),
      result,
      resetExpiry,
    );
    await atomic.commit();
  }

  async getTaskResult(taskId: string, _sessionId?: string): Promise<Result> {
    const kv = await getKvStore();
    const task = await getMetaRecord(kv, taskId);
    if (!task) {
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
    const record = await getMetaRecord(kv, taskId);
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

    await withOptionalExpiry(
      kv.atomic(),
      createTaskMetaKey(taskId),
      updatedRecord,
      expireIn,
    ).commit();
  }

  async listTasks(
    cursor?: string,
    _sessionId?: string,
  ): Promise<{ tasks: Task[]; nextCursor?: string }> {
    const kv = await getKvStore();
    const tasks: Task[] = [];

    for await (const entry of kv.list<TaskMetaRecord>({ prefix: TASK_META_PREFIX })) {
      const task = entry.value?.task;
      if (task) {
        tasks.push(cloneTask(task));
      }
    }

    tasks.sort((a, b) => {
      const byCreatedAt = a.createdAt.localeCompare(b.createdAt);
      if (byCreatedAt !== 0) return byCreatedAt;
      return a.taskId.localeCompare(b.taskId);
    });

    let startIndex = 0;
    if (cursor) {
      const cursorIndex = tasks.findIndex((task) => task.taskId === cursor);
      if (cursorIndex === -1) {
        throw new Error(`Invalid cursor: ${cursor}`);
      }
      startIndex = cursorIndex + 1;
    }

    const page = tasks.slice(startIndex, startIndex + PAGE_SIZE);
    const nextCursor = startIndex + PAGE_SIZE < tasks.length ? page.at(-1)?.taskId : undefined;

    return {
      tasks: page,
      nextCursor,
    };
  }
}
