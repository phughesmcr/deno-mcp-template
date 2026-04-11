import { deriveMcpRuntimeRequirements, type McpServerDefinition } from "$/mcp/serverDefinition.ts";

function stubDef(overrides: Partial<McpServerDefinition>): McpServerDefinition {
  return {
    prompts: [],
    resources: [],
    tools: [],
    promptsListChanged: false,
    resourceListChanged: false,
    resourceSubscribe: false,
    toolsListChanged: false,
    tasksEnabled: false,
    experimentalElicitation: false,
    mcpAppsExtension: false,
    fetchWebsiteInfoApp: false,
    urlElicitationDemo: false,
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
      tools: [["my-tool", { runtime: { requiresNet: true } }, () => {}]],
    }),
  );
  if (r.net !== true) throw new Error(`expected net true, got ${r.net}`);
});

Deno.test("deriveMcpRuntimeRequirements: tool id rename does not matter if metadata kept", () => {
  const r = deriveMcpRuntimeRequirements(
    stubDef({
      tools: [["renamed-execute", { runtime: { requiresNet: true } }, () => {}]],
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
