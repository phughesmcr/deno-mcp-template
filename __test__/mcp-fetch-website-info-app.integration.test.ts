import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { CallToolResult, ServerContext } from "@modelcontextprotocol/server";

import { FETCH_WEBSITE_INFO_RESOURCE_URI } from "$/mcp/apps/fetchWebsiteInfoApp.ts";
import {
  executeFetchWebsiteInfo,
  FETCH_WEBSITE_INFO_TOOL_NAME,
  type FetchWebsiteInfoSuccess,
} from "$/mcp/tools/fetchWebsiteInfoShared.ts";
import { parseToolResult } from "../mcp-ui/src/toolResult.ts";
import { assert, assertEquals } from "./helpers.ts";
import { createTestMcpHandler, mcpRequest } from "./mcpHttp.ts";

const URL_UNDER_TEST = "https://example.com/";

/** Never answers; rejects as real `fetch` does, with the signal's reason. */
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

async function withFetch<T>(stub: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

function contextWith(signal: AbortSignal): ServerContext {
  return { mcpReq: { signal } } as unknown as ServerContext;
}

type FetchToolResult = CallToolResult & { structuredContent?: FetchWebsiteInfoSuccess };

function callFetchTool(url: string): Promise<{ result: FetchToolResult }> {
  const params = { name: FETCH_WEBSITE_INFO_TOOL_NAME, arguments: { url } };
  const request = mcpRequest("tools/call", params, { name: FETCH_WEBSITE_INFO_TOOL_NAME });
  return createTestMcpHandler().fetch(request).then((response) => response.json());
}

Deno.test({
  name: "MCP App resource fetch-website-info.html is registered with mcp-app mime type",
  fn: async () => {
    const handler = createTestMcpHandler();

    const response = await handler.fetch(
      mcpRequest("resources/read", { uri: FETCH_WEBSITE_INFO_RESOURCE_URI }, {
        name: FETCH_WEBSITE_INFO_RESOURCE_URI,
      }),
    );
    const payload = await response.json() as {
      result?: {
        contents: Array<{
          mimeType?: string;
          text?: string;
          _meta?: { ui?: { prefersBorder?: boolean } };
        }>;
        ttlMs?: number;
        cacheScope?: string;
      };
    };
    assert(
      payload.result !== undefined,
      `expected result, got ${JSON.stringify(payload).slice(0, 300)}`,
    );

    const content = payload.result.contents[0];
    assert(content !== undefined, "expected one resource content item");
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
    assertEquals(content._meta?.ui?.prefersBorder, false);
    assertEquals(payload.result.ttlMs, 3_600_000);
    assertEquals(payload.result.cacheScope, "public");
  },
});

Deno.test("the bundle is self-contained and has every element of the page", async () => {
  const bundle = await Deno.readTextFile(
    new URL("../static/mcp-apps/fetch-website-info.html", import.meta.url),
  );
  const page = await Deno.readTextFile(
    new URL("../mcp-ui/fetch-website-info.html", import.meta.url),
  );
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert(ids.length > 0, "expected the page to have ids");
  const missing = ids.filter((id) => !bundle.includes(`id="${id}"`));
  assert(missing.length === 0, `stale bundle, run deno task build:mcp-ui: ${missing.join(", ")}`);
  assert(/<script\b[^>]*>\s*\S/.test(bundle), "expected an inline script");
  assert(bundle.includes("<style"), "expected inline styles");
  assert(!/<(?:script|img|iframe)\b[^>]*\ssrc=/.test(bundle), "expected no external src");
  assert(!/<link\b[^>]*\shref=/.test(bundle), "expected no external link");
});

Deno.test("fetch-website-info advertises its output schema", async () => {
  const response = await createTestMcpHandler().fetch(mcpRequest("tools/list"));
  const { result } = await response.json() as {
    result: { tools: { name: string; outputSchema?: { required?: string[] } }[] };
  };
  const tool = result.tools.find(({ name }) => name === FETCH_WEBSITE_INFO_TOOL_NAME);
  assert(tool?.outputSchema?.required?.includes("status"), "expected an output schema");
});

Deno.test("fetch-website-info returns structured content matching its schema", async () => {
  const stub: typeof fetch = () =>
    Promise.resolve(new Response(null, { status: 200, headers: { server: "stub" } }));
  const { result } = await withFetch(stub, () => callFetchTool(URL_UNDER_TEST));
  assertEquals(result.isError, undefined);
  assertEquals(result.structuredContent?.status, 200);
  assertEquals(result.structuredContent?.headers.server, "stub");
  assertEquals(parseToolResult(result).kind, "success");
});

Deno.test("an error result is not held to the output schema", async () => {
  const { result } = await callFetchTool("https://localhost/");
  assertEquals(result.isError, true);
  assertEquals(result.structuredContent, undefined);
  assert(JSON.stringify(result.content).includes("URL not allowed"), "expected a denial");
  const parsed = parseToolResult(result);
  assert(parsed.kind === "error", `expected the app to show an error, got ${parsed.kind}`);
  assert(parsed.message.startsWith("URL not allowed"), `expected plain text: ${parsed.message}`);
});

Deno.test("fetch-website-info reports a timeout", async () => {
  const realTimeout = AbortSignal.timeout;
  AbortSignal.timeout = () => realTimeout.call(AbortSignal, 1);
  try {
    const context = contextWith(new AbortController().signal);
    const result = await withFetch(
      hangingFetch,
      () => executeFetchWebsiteInfo({ url: URL_UNDER_TEST }, context),
    );
    assertEquals(result.isError, true);
    assert(JSON.stringify(result.content).includes("timed out"), "expected a timeout error");
  } finally {
    AbortSignal.timeout = realTimeout;
  }
});

Deno.test("cancelling the request aborts fetch-website-info", async () => {
  const controller = new AbortController();
  const stub: typeof fetch = (input, init) => {
    const pending = hangingFetch(input, init);
    controller.abort(new Error("cancelled by client"));
    return pending;
  };
  const result = await withFetch(
    stub,
    () => executeFetchWebsiteInfo({ url: URL_UNDER_TEST }, contextWith(controller.signal)),
  );
  assertEquals(result.isError, true);
  assert(JSON.stringify(result.content).includes("cancelled by client"), "expected cancellation");
});
