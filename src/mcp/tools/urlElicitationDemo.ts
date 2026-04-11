/**
 * @description Demo tool for URL-mode elicitation (browser confirmation + completion notification).
 * @module
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { UrlElicitationRequiredError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { McpServerFactoryContext } from "$/mcp/context.ts";
import { createCallToolErrorResponse } from "$/shared/utils.ts";

const schema = z.object({
  label: z.string()
    .min(1, "Label is required")
    .max(200, "Label too long")
    .describe("Short text shown on the browser confirmation page"),
});

const name = "url-elicitation-demo";

/**
 * Registers a tool that throws {@link UrlElicitationRequiredError} so the client opens a URL;
 * completing the flow in the browser sends `notifications/elicitation/complete`.
 */
export function registerUrlElicitationDemoTool(mcp: McpServer, ctx: McpServerFactoryContext): void {
  mcp.registerTool(
    name,
    {
      title: "URL elicitation demo",
      description: "Requires confirming an action in the browser (URL-mode elicitation). " +
        "Only works over streamable HTTP with an MCP session; use the link the client shows after calling this tool.",
      inputSchema: schema.shape,
    },
    async (
      args: unknown,
      extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
    ): Promise<CallToolResult> => {
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        return createCallToolErrorResponse({
          error: "Invalid arguments",
          details: parsed.error.flatten(),
          received: args,
        });
      }

      const sessionId = extra.sessionId?.trim();
      if (!sessionId) {
        return createCallToolErrorResponse({
          error: "URL elicitation needs a streamable HTTP session (Mcp-Session-Id). " +
            "It is not available on the STDIO transport.",
        });
      }

      const baseUrl = ctx.urlElicitation.baseUrl;
      if (!baseUrl) {
        return createCallToolErrorResponse({
          error: "HTTP is disabled; URL elicitation is not available.",
        });
      }

      const elicitationId = crypto.randomUUID();
      const completionNotifier = mcp.server.createElicitationCompletionNotifier(elicitationId);
      const { label } = parsed.data;

      ctx.urlElicitation.registry.registerPending({
        elicitationId,
        sessionId,
        label,
        completionNotifier,
      });

      const url = new URL("/mcp-elicitation/confirm", `${baseUrl}/`);
      url.searchParams.set("session", sessionId);
      url.searchParams.set("elicitation", elicitationId);

      throw new UrlElicitationRequiredError(
        [
          {
            mode: "url",
            message: "Open the link in your browser to confirm or cancel this demo action.",
            url: url.href,
            elicitationId,
          },
        ],
        "Browser confirmation required",
      );
    },
  );
}
