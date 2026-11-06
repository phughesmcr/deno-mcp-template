import { ProtocolError, ProtocolErrorCode, type ServerContext } from "@modelcontextprotocol/server";

import { loadAppConfig } from "$/app/cli.ts";
import greetings from "$/mcp/resources/greetings.ts";
import { mcpServerDefinition } from "$/mcp/serverDefinition.ts";

import { assert, assertEquals, mcpFactoryContext } from "./helpers.ts";
import { createTestMcpHandler, mcpRequest } from "./mcpHttp.ts";

type ReadResponse = {
  result?: { contents: { text?: string; blob?: string }[] };
  error?: { code: number };
};

function readResource(uri: string): Promise<ReadResponse> {
  const request = mcpRequest("resources/read", { uri }, { name: uri });
  return createTestMcpHandler().fetch(request).then((response) => response.json());
}

Deno.test("default server definition includes conformance showcase tools", () => {
  const names = mcpServerDefinition.tools.map((t) => t.name);
  assert(names.includes("test_simple_text"), "expected test_simple_text tool");
});

Deno.test("default server definition includes test:// resources", () => {
  const staticUris = mcpServerDefinition.resources
    .filter((r) => r.type === "resource")
    .map((r) => r.uri);
  assert(staticUris.includes("test://static-text"), "expected test://static-text");
  const hasTemplate = mcpServerDefinition.resources.some(
    (r) => r.type === "template" && r.name === "conf-test-template",
  );
  assert(hasTemplate, "expected conf-test-template resource template");
});

Deno.test("default server definition includes conformance showcase prompts", () => {
  const names = mcpServerDefinition.prompts.map((p) => p.name);
  assert(names.includes("test_simple_prompt"), "expected test_simple_prompt");
  assert(names.includes("test_prompt_with_arguments"), "expected test_prompt_with_arguments");
});

Deno.test("HTTP rate limiting is on by default", async () => {
  const config = await loadAppConfig({ argv: [], onFailure: "throw" });
  assertEquals(config.http.rateLimit.enabled, true);
});

Deno.test("test://static-binary is the base64 of its bytes", async () => {
  const { result } = await readResource("test://static-binary");
  assertEquals(result?.contents[0]?.blob, "AAECA/8=");
});

Deno.test("greetings reads the name from the template variables", async () => {
  const { result } = await readResource("greetings://Ada");
  assertEquals(result?.contents[0]?.text, "Hello, Ada! Welcome to MCP.");
});

Deno.test("greetings rejects a name that is not one non-empty string", async () => {
  const ctx = {} as ServerContext;
  const deps = mcpFactoryContext();
  for (const name of ["  ", ["Ada", "Alan"]]) {
    let code: number | undefined;
    try {
      await greetings.readCallback(new URL("greetings://x"), { name }, ctx, deps);
    } catch (error) {
      if (error instanceof ProtocolError) code = error.code;
    }
    assertEquals(code, ProtocolErrorCode.InvalidParams);
  }
});
