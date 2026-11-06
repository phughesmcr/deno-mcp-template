/**
 * @description Diagnostic tools the conformance suite's `server-stateless` scenario probes.
 * Tool names and required capabilities are fixed by the suite.
 * @module
 */

import { inputRequired } from "@modelcontextprotocol/server";
import { z } from "zod";

import { samplingText, text } from "$/mcp/inputResponses.ts";
import { defineTool, type ToolPlugin } from "$/mcp/plugin-types.ts";

const noArgs = z.object({});

const missingCapability = defineTool({
  name: "test_missing_capability",
  description: "Needs sampling; the SDK answers -32021 if the client did not declare it",
  inputSchema: noArgs,
  handler: (_args, ctx) => {
    if (samplingText(ctx, "probe") !== undefined) return text("Success");
    return inputRequired({
      inputRequests: {
        probe: inputRequired.createMessage({
          messages: [{ role: "user", content: { type: "text", text: "Say anything" } }],
          maxTokens: 10,
        }),
      },
    });
  },
});

const streamingElicitation = defineTool({
  name: "test_streaming_elicitation",
  description: "Sends progress on the response stream, then completes",
  inputSchema: noArgs,
  handler: async (_args, ctx) => {
    const progressToken = ctx.mcpReq._meta?.progressToken;
    if (progressToken !== undefined) {
      await ctx.mcpReq.notify({
        method: "notifications/progress",
        params: { progressToken, progress: 50, total: 100 },
      });
    }
    return text("Streaming complete");
  },
});

const loggingTool = defineTool({
  name: "test_logging_tool",
  description: "Logs once; the SDK drops it unless the request set a log level",
  inputSchema: noArgs,
  handler: async (_args, ctx) => {
    await ctx.mcpReq.log("info", "Diagnostic trace logging activated");
    return text("Logging evaluated");
  },
});

const triggerToolChange = defineTool({
  name: "test_trigger_tool_change",
  description: "Publishes a tools list-changed event",
  inputSchema: noArgs,
  handler: (_args, _ctx, { events }) => {
    events.publish({ kind: "tools_list_changed" });
    return text("Mutation triggered");
  },
});

const triggerPromptChange = defineTool({
  name: "test_trigger_prompt_change",
  description: "Publishes a prompts list-changed event",
  inputSchema: noArgs,
  handler: (_args, _ctx, { events }) => {
    events.publish({ kind: "prompts_list_changed" });
    return text("Mutation triggered");
  },
});

export const testDiagnosticTools: readonly ToolPlugin[] = [
  missingCapability,
  streamingElicitation,
  loggingTool,
  triggerToolChange,
  triggerPromptChange,
];
