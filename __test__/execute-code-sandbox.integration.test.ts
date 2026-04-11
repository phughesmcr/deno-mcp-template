/**
 * Requires `DENO_DEPLOY_TOKEN` (and Deploy sandbox quota). Skipped in CI when unset.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

import sandboxTool from "$/mcp/tools/sandbox.ts";
import { assert } from "./helpers.ts";

const hasDeployToken = Boolean(Deno.env.get("DENO_DEPLOY_TOKEN")?.trim());

Deno.test({
  name: "execute-code tool runs trivial script in Deno Sandbox",
  ignore: !hasDeployToken,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const [, , factory] = sandboxTool;
    const handler = factory({} as McpServer);
    const extra = {
      signal: AbortSignal.timeout(120_000),
      sendNotification: async (_n: ServerNotification) => {},
    } as RequestHandlerExtra<ServerRequest, ServerNotification>;

    const result = await handler(
      {
        code: 'console.log("sandbox_ci_ok")',
        language: "javascript" as const,
        timeoutMs: 30_000,
      },
      extra,
    );

    const payload = JSON.stringify(result);
    assert(
      payload.includes("sandbox_ci_ok"),
      `expected stdout in tool result, got: ${payload.slice(0, 500)}`,
    );
  },
});
