import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

import { FETCH_WEBSITE_INFO_RESOURCE_URI } from "$/mcp/apps/fetchWebsiteInfoApp.ts";
import { assert } from "./helpers.ts";
import { createTestMcpHandler, mcpRequest } from "./mcpHttp.ts";

Deno.test({
  name: "MCP App resource fetch-website-info.html is registered with mcp-app mime type",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const handler = createTestMcpHandler();

    const response = await handler.fetch(
      mcpRequest("resources/read", { uri: FETCH_WEBSITE_INFO_RESOURCE_URI }, {
        name: FETCH_WEBSITE_INFO_RESOURCE_URI,
      }),
    );
    const payload = await response.json() as {
      result?: { contents: Array<{ mimeType?: string; text?: string }> };
    };
    assert(payload.result != null, `expected result, got ${JSON.stringify(payload).slice(0, 300)}`);

    const content = payload.result.contents[0];
    assert(content != null, "expected one resource content item");
    assert(
      content.mimeType === RESOURCE_MIME_TYPE,
      `mimeType should be ${RESOURCE_MIME_TYPE}, got ${content.mimeType}`,
    );
    assert(
      typeof content.text === "string" && content.text.length > 100,
      "expected non-trivial HTML text",
    );
    assert(
      content.text.includes("<!DOCTYPE html>") || content.text.includes("<!doctype html>"),
      "expected HTML doctype in bundled app",
    );
  },
});
