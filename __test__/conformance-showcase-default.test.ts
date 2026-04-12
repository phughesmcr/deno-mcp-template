import { loadAppConfig } from "$/app/cli.ts";
import { mcpServerDefinition } from "$/mcp/serverDefinition.ts";

import { assert, assertEquals } from "./helpers.ts";

Deno.test("default server definition includes conformance showcase tools", () => {
  const names = mcpServerDefinition.tools.map((t) => t[0]);
  assert(names.includes("test_simple_text"), "expected test_simple_text tool");
  assert(names.includes("test_sampling"), "expected test_sampling tool");
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
  const names = mcpServerDefinition.prompts.map((p) => p[0]);
  assert(names.includes("test_simple_prompt"), "expected test_simple_prompt");
  assert(names.includes("test_prompt_with_arguments"), "expected test_prompt_with_arguments");
});

Deno.test("HTTP rate limiting is on by default", async () => {
  const config = await loadAppConfig({ argv: [], onFailure: "throw" });
  assertEquals(config.http.rateLimit.enabled, true);
});
