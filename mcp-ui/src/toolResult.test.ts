/// <reference lib="deno.ns" />
import { parseToolResult, type WebsiteInfo } from "./toolResult.ts";

const info: WebsiteInfo = {
  url: "https://example.com/",
  status: 200,
  statusText: "OK",
  redirected: false,
  headers: { "content-type": "text/html" },
  timestamp: "2026-11-06T00:00:00.000Z",
};

function assertKind(
  actual: ReturnType<typeof parseToolResult>,
  kind: string,
  message?: string,
): void {
  if (actual.kind !== kind) throw new Error(`got ${JSON.stringify(actual)}`);
  if (message !== undefined && "message" in actual) {
    if (actual.message !== message) throw new Error(actual.message);
  }
}

Deno.test("structured content that matches the schema is a success", () => {
  assertKind(
    parseToolResult({ content: [], structuredContent: info }),
    "success",
  );
});

Deno.test("structured content with the wrong shape is not a success", () => {
  const structuredContent = { ...info, status: { a: 1 } };
  assertKind(parseToolResult({ content: [], structuredContent }), "unexpected");
});

Deno.test("a result that is not an error is never reported as one", () => {
  const text = "All good, not JSON";
  assertKind(
    parseToolResult({ content: [{ type: "text", text }] }),
    "unexpected",
    text,
  );
  assertKind(parseToolResult({ content: [] }), "unexpected");
});

Deno.test("an error shows the server's message, not its JSON", () => {
  const text = JSON.stringify({ error: "URL not allowed" });
  assertKind(
    parseToolResult({ isError: true, content: [{ type: "text", text }] }),
    "error",
    "URL not allowed",
  );
});

Deno.test("an error keeps plain text and copes with no text", () => {
  assertKind(
    parseToolResult({
      isError: true,
      content: [{ type: "text", text: "boom" }],
    }),
    "error",
    "boom",
  );
  assertKind(
    parseToolResult({ isError: true, content: [] }),
    "error",
    "The tool failed without a message.",
  );
});
