/**
 * Requires `DENO_DEPLOY_TOKEN` (and Deploy sandbox quota). Skipped in CI when unset.
 */
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";

import sandboxTool from "$/mcp/tools/sandbox.ts";
import { assert, mcpFactoryContext } from "./helpers.ts";

const hasDeployToken = Boolean(Deno.env.get("DENO_DEPLOY_TOKEN")?.trim());

type ToolCallback = (args: unknown, ctx: ServerContext) => Promise<unknown>;

Deno.test({
  name: "execute-code tool runs trivial script in Deno Sandbox",
  ignore: !hasDeployToken,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let handler: ToolCallback | undefined;
    const fakeMcp = {
      registerTool: (_name: string, _config: unknown, cb: ToolCallback) => {
        handler = cb;
      },
    } as unknown as McpServer;
    sandboxTool.register(fakeMcp, mcpFactoryContext());
    assert(handler, "expected sandbox tool to register a handler");

    const ctx = {
      mcpReq: { signal: AbortSignal.timeout(120_000), _meta: {} },
    } as unknown as ServerContext;

    const result = await handler(
      {
        code: 'console.log("sandbox_ci_ok")',
        language: "javascript" as const,
        timeoutMs: 30_000,
      },
      ctx,
    );

    const payload = JSON.stringify(result);
    assert(
      payload.includes("sandbox_ci_ok"),
      `expected stdout in tool result, got: ${payload.slice(0, 500)}`,
    );
  },
});
