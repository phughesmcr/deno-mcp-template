import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ShapeOutput,
  ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type {
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra,
  ToolTaskHandler,
} from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import { enqueueDelayedEchoTask } from "$/mcp/tasks/mod.ts";

// WARNING: Task APIs are experimental and may change without notice.

const schema = z.object({
  text: z.string().min(1, "Text is required").max(2000, "Text too long"),
  delayMs: z.number().int().min(0, "Delay must be positive").max(10000, "Delay too long")
    .optional(),
});

const inputSchema = schema.shape as unknown as ZodRawShapeCompat;

const name = "delayed-echo";
type InputShape = typeof inputSchema;
type InputArgs = ShapeOutput<InputShape>;

export function registerDelayedEchoTask(mcp: McpServer): void {
  const handler: ToolTaskHandler<InputShape> = {
    createTask: async (args: InputArgs, extra: CreateTaskRequestHandlerExtra) => {
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        throw new Error(parsed.error.message);
      }

      const { text, delayMs } = parsed.data;
      const delay = Math.min(Math.max(delayMs ?? 2000, 0), 10000);
      const task = await extra.taskStore.createTask({
        ttl: 60000,
        pollInterval: 1000,
      });

      await enqueueDelayedEchoTask({
        taskId: task.taskId,
        text,
        delayMs: delay,
      });

      return { task };
    },
    getTask: async (_args: InputArgs, extra: TaskRequestHandlerExtra) => {
      return await extra.taskStore.getTask(extra.taskId);
    },
    getTaskResult: async (_args: InputArgs, extra: TaskRequestHandlerExtra) => {
      return await extra.taskStore.getTaskResult(extra.taskId) as CallToolResult;
    },
  };

  mcp.experimental.tasks.registerToolTask<InputShape, undefined>(
    name,
    {
      title: "Delayed echo (task)",
      description: "Echo text after a delay using task-based execution",
      inputSchema,
      execution: { taskSupport: "required" },
    },
    handler,
  );
}
