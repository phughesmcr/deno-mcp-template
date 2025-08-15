import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult, ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";

import type { ResourceTemplatePlugin } from "$/shared/types.ts";

const name = "greetings";

const template: ResourceTemplate = {
  name: "greetings",
  uriTemplate: "greetings://{name}",
  mimeType: "text/plain",
};

const config: ResourceMetadata = {};

async function readCallback(
  uri: URL,
  variables: Record<string, unknown>,
): Promise<ReadResourceResult> {
  const _name = uri.toString().match(/^greetings:\/\/(.+)$/);
  if (!_name) throw new SyntaxError("Invalid greetings URI format");
  const name = (variables.name as string) ?? _name[1];
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new SyntaxError("Name parameter is required and must be a non-empty string");
  }
  // Sanitize name to prevent injection
  const sanitizedName = name.trim().slice(0, 100).replace(/[^a-zA-Z0-9\-]/g, "");
  return {
    contents: [
      {
        uri: uri.toString(),
        text: `Hello, ${sanitizedName}! Welcome to MCP.`,
      },
    ],
  };
}

const module: ResourceTemplatePlugin = [
  name,
  template,
  config,
  readCallback,
];

export default module;
