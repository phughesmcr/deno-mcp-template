import type {
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra,
  ToolTaskHandler,
} from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ShapeOutput,
  ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type {
  CallToolResult,
  CreateMessageResult,
  ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

// WARNING: Task APIs are experimental and may change without notice.

const schema = z.object({
  topic: z.string().min(1, "Topic is required").max(200, "Topic too long").optional(),
});

const inputSchema = schema.shape as unknown as ZodRawShapeCompat;
const name = "guided-poem";
type InputShape = typeof inputSchema;
type InputArgs = ShapeOutput<InputShape>;

function getSamplingText(result: CreateMessageResult): string {
  const content = Array.isArray(result.content) ? result.content[0] : result.content;
  if (!content || content.type !== "text") {
    throw new Error("Sampling response did not contain text content");
  }
  return content.text;
}

async function elicitPoemRequest(mcp: McpServer, topicHint?: string): Promise<ElicitResult> {
  const stream = mcp.server.experimental.tasks.elicitInputStream({
    mode: "form",
    message: "Provide poem details before generation.",
    requestedSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          title: "Topic",
          description: "What should the poem be about?",
          ...(topicHint ? { default: topicHint } : {}),
        },
        style: {
          type: "string",
          title: "Style (optional)",
          description: "Examples: haiku, free verse, sonnet",
        },
      },
      required: ["topic"],
    },
  });

  let result: ElicitResult | null = null;
  for await (const message of stream) {
    if (message.type === "result") {
      result = message.result;
    } else if (message.type === "error") {
      throw message.error;
    }
  }

  if (!result) {
    throw new Error("No elicitation result returned by client");
  }
  return result;
}

async function streamPoemGeneration(
  mcp: McpServer,
  topic: string,
  style?: string,
): Promise<CreateMessageResult> {
  const stream = mcp.server.experimental.tasks.createMessageStream(
    {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Write a short poem (<= 12 lines) about "${topic}".` +
              (style ? ` Prefer a ${style} style.` : ""),
          },
        },
      ],
      maxTokens: 512,
      temperature: 0.7,
    },
    { timeout: 30000 },
  );

  let result: CreateMessageResult | null = null;
  for await (const message of stream) {
    if (message.type === "result") {
      result = message.result;
    } else if (message.type === "error") {
      throw message.error;
    }
  }

  if (!result) {
    throw new Error("No sampling result returned by client");
  }
  return result;
}

export function registerGuidedPoemTask(mcp: McpServer): void {
  const handler: ToolTaskHandler<InputShape> = {
    createTask: async (args: InputArgs, extra: CreateTaskRequestHandlerExtra) => {
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        throw new Error(parsed.error.message);
      }

      const topicHint = parsed.data.topic?.trim();
      const task = await extra.taskStore.createTask({
        ttl: 120000,
        pollInterval: 1000,
      });
      const taskStore = extra.taskStore;

      void (async () => {
        try {
          const elicitationResult = await elicitPoemRequest(mcp, topicHint);
          if (elicitationResult.action !== "accept") {
            await taskStore.storeTaskResult(
              task.taskId,
              "completed",
              createCallToolTextResponse({
                action: elicitationResult.action,
                message: "Poem generation cancelled by user.",
              }),
            );
            return;
          }

          const topic = String(elicitationResult.content?.topic ?? topicHint ?? "").trim();
          const style = String(elicitationResult.content?.style ?? "").trim() || undefined;

          if (!topic.length) {
            throw new Error("Topic is required to generate a poem");
          }

          const samplingResult = await streamPoemGeneration(mcp, topic, style);
          const poem = getSamplingText(samplingResult);

          await taskStore.storeTaskResult(
            task.taskId,
            "completed",
            createCallToolTextResponse({
              topic,
              style: style ?? null,
              poem,
              model: samplingResult.model,
            }),
          );
        } catch (error) {
          try {
            await taskStore.storeTaskResult(
              task.taskId,
              "failed",
              createCallToolErrorResponse({
                error: error instanceof Error ? error.message : "Unknown guided-poem task failure",
              }),
            );
          } catch (storeError) {
            console.error("Failed to store guided-poem task failure", storeError);
          }
        }
      })();

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
      title: "Guided poem (task + streaming)",
      description:
        "Uses streaming elicitation and sampling within a task-based tool execution flow.",
      inputSchema,
      execution: { taskSupport: "required" },
    },
    handler,
  );
}
