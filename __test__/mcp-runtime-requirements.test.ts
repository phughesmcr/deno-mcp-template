import type { ToolPlugin } from "$/mcp/plugin-types.ts";
import { deriveMcpRuntimeRequirements, type McpServerDefinition } from "$/mcp/serverDefinition.ts";

function stubTool(name: string, requiresNet: boolean): ToolPlugin {
  return { name, runtime: { requiresNet }, register: () => {} };
}

function stubDef(overrides: Partial<McpServerDefinition>): McpServerDefinition {
  return {
    prompts: [],
    resources: [],
    tools: [],
    resourceSubscribe: false,
    mcpAppsExtension: false,
    fetchWebsiteInfoApp: false,
    ...overrides,
  };
}

Deno.test("deriveMcpRuntimeRequirements: no flags and no tool metadata → net false", () => {
  const r = deriveMcpRuntimeRequirements(stubDef({}));
  if (r.net !== false) throw new Error(`expected net false, got ${r.net}`);
});

Deno.test("deriveMcpRuntimeRequirements: fetchWebsiteInfoApp → net true", () => {
  const r = deriveMcpRuntimeRequirements(stubDef({ fetchWebsiteInfoApp: true }));
  if (r.net !== true) throw new Error(`expected net true, got ${r.net}`);
});

Deno.test("deriveMcpRuntimeRequirements: tool with runtime.requiresNet → net true", () => {
  const r = deriveMcpRuntimeRequirements(
    stubDef({
      tools: [stubTool("my-tool", true)],
    }),
  );
  if (r.net !== true) throw new Error(`expected net true, got ${r.net}`);
});

Deno.test("deriveMcpRuntimeRequirements: tool id rename does not matter if metadata kept", () => {
  const r = deriveMcpRuntimeRequirements(
    stubDef({
      tools: [stubTool("renamed-execute", true)],
    }),
  );
  if (r.net !== true) throw new Error(`expected net true, got ${r.net}`);
});

Deno.test("deriveMcpRuntimeRequirements: fetchWebsiteInfoApp short-circuits before scanning tools", () => {
  const r = deriveMcpRuntimeRequirements(
    stubDef({
      fetchWebsiteInfoApp: true,
      tools: [],
    }),
  );
  if (r.net !== true) throw new Error(`expected net true, got ${r.net}`);
});
