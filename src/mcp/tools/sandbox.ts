/**
 * @description Executes user code inside a Deno Sandbox (isolated microVM)
 * @see {@link https://deno.com/deploy/sandboxes}
 * @module
 */

import { Sandbox } from "@deno/sandbox";
import type { CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;

const SANDBOX_PROGRESS_TOTAL = 4;

async function sendExecuteCodeProgress(
  ctx: ServerContext,
  progress: number,
  message: string,
): Promise<void> {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  if (progressToken === undefined) return;
  await ctx.mcpReq.notify({
    method: "notifications/progress",
    params: {
      progressToken,
      progress,
      total: SANDBOX_PROGRESS_TOTAL,
      message,
    },
  });
}

const schema = z.object({
  code: z.string()
    .min(1, "Code is required")
    .max(50_000, "Code too long (max 50,000 characters)")
    .describe("The TypeScript or JavaScript code to execute"),
  language: z.enum(["typescript", "javascript"])
    .default("typescript")
    .describe("The language of the code"),
  timeoutMs: z.number()
    .int()
    .min(100)
    .max(MAX_TIMEOUT_MS)
    .default(DEFAULT_TIMEOUT_MS)
    .describe("Execution timeout in milliseconds"),
});

export default defineTool({
  name: "execute-code",
  runtime: { requiresNet: true },
  title: "Execute Code in Sandbox",
  description:
    "Safely execute TypeScript or JavaScript code in an isolated Deno Sandbox (Firecracker microVM). " +
    "The sandbox has no access to the host system, network, or filesystem outside the VM. " +
    "Use console.log() to produce output.",
  inputSchema: schema,
  annotations: {
    title: "Execute Code in Sandbox",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ code, language, timeoutMs }, ctx): Promise<CallToolResult> => {
    const { signal } = ctx.mcpReq;
    const ext = language === "typescript" ? "ts" : "js";
    const filePath = `/tmp/user_code.${ext}`;
    const start = performance.now();

    /** Reports progress, then stops if the client cancelled while the last step ran. */
    const step = async (progress: number, message: string): Promise<void> => {
      await sendExecuteCodeProgress(ctx, progress, message);
      signal.throwIfAborted();
    };

    try {
      await step(1, "Creating isolated sandbox…");
      await using sandbox = await Sandbox.create();

      await step(2, "Writing code to sandbox…");
      await sandbox.fs.writeTextFile(filePath, code);

      await step(3, "Starting Deno in sandbox…");
      const child = await sandbox.spawn("deno", {
        args: ["run", filePath],
        stdout: "piped",
        stderr: "piped",
      });

      await step(4, "Running code (waiting for exit)…");

      // Starts here so that `timeoutMs` measures the code, not the VM boot. SIGKILL, not spawn's
      // `signal` option: that sends SIGTERM, which the code could trap to keep `output()` pending.
      const timeout = AbortSignal.timeout(timeoutMs);
      AbortSignal.any([signal, timeout]).addEventListener(
        "abort",
        () => child.kill("SIGKILL").catch(console.error),
        { once: true },
      );

      const output = await child.output();
      const executionTimeMs = Math.round(performance.now() - start);

      if (timeout.aborted) {
        return createCallToolErrorResponse({
          error: `Execution timed out after ${timeoutMs}ms`,
          executionTimeMs,
        });
      }
      signal.throwIfAborted();

      const stdout = output.stdoutText?.trim() ?? "";
      const stderr = output.stderrText?.trim() ?? "";

      if (output.status.code !== 0) {
        return createCallToolErrorResponse({
          error: "Code execution failed",
          exitCode: output.status.code,
          stdout: stdout || undefined,
          stderr: stderr || undefined,
          executionTimeMs,
        });
      }

      return createCallToolTextResponse({
        stdout: stdout || "(no output)",
        stderr: stderr || undefined,
        exitCode: output.status.code,
        executionTimeMs,
      });
    } catch (error) {
      // The SDK discards a cancelled request's result; stopping early only frees the sandbox.
      if (signal.aborted) {
        return createCallToolErrorResponse({ error: "Code execution was cancelled" });
      }
      return createCallToolErrorResponse({
        error: error instanceof Error ? error.message : "Unknown error during code execution",
        executionTimeMs: Math.round(performance.now() - start),
        operation: "execute-code",
      });
    }
  },
});
