/**
 * @description Executes user code inside a Deno Sandbox (isolated microVM)
 * @see {@link https://deno.com/deploy/sandboxes}
 * @module
 */

import { Sandbox } from "@deno/sandbox";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";
import { createCallToolErrorResponse, createCallToolTextResponse } from "$/shared/utils.ts";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;

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

const name = "execute-code";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Execute Code in Sandbox",
  description:
    "Safely execute TypeScript or JavaScript code in an isolated Deno Sandbox (Firecracker microVM). " +
    "The sandbox has no access to the host system, network, or filesystem outside the VM. " +
    "Use console.log() to produce output.",
  inputSchema: schema.shape,
  annotations: {
    title: "Execute Code in Sandbox",
    readOnlyHint: true,
    openWorldHint: false,
  },
};

// deno-lint-ignore no-explicit-any
const callback = (_mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  const parsed = schema.safeParse(args);

  if (!parsed.success) {
    return createCallToolErrorResponse({
      error: "Invalid arguments",
      details: parsed.error.flatten(),
      received: args,
    });
  }

  const { code, language, timeoutMs } = parsed.data;
  const ext = language === "typescript" ? "ts" : "js";
  const filePath = `/tmp/user_code.${ext}`;
  const start = performance.now();

  try {
    await using sandbox = await Sandbox.create();

    await sandbox.fs.writeTextFile(filePath, code);

    const child = await sandbox.spawn("deno", {
      args: ["run", filePath],
      stdout: "piped",
      stderr: "piped",
    });

    const timeoutId = setTimeout(() => child.kill(), timeoutMs);
    let timedOut = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        timedOut = true;
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs + 500);
    });

    try {
      const output = await Promise.race([child.output(), timeoutPromise]);
      clearTimeout(timeoutId);

      const executionTimeMs = Math.round(performance.now() - start);
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
    } catch (raceError) {
      clearTimeout(timeoutId);
      if (timedOut) {
        return createCallToolErrorResponse({
          error: `Execution timed out after ${timeoutMs}ms`,
          executionTimeMs: Math.round(performance.now() - start),
        });
      }
      throw raceError;
    }
  } catch (error) {
    return createCallToolErrorResponse({
      error: error instanceof Error ? error.message : "Unknown error during code execution",
      executionTimeMs: Math.round(performance.now() - start),
      operation: "execute-code",
    });
  }
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [
  name,
  config,
  callback,
];

export default module;
