import {
  type CompleteResourceTemplateCallback,
  type ResourceMetadata,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourceTemplatePlugin } from "$/shared/types.ts";

const name = "greetings";

const nameSuggestions = [
  "Ada",
  "Alan",
  "Grace",
  "Linus",
  "Margaret",
  "Ken",
];

const completeName: CompleteResourceTemplateCallback = (value) => {
  const prefix = value.trim().toLowerCase();
  return nameSuggestions
    .filter((name) => name.toLowerCase().startsWith(prefix))
    .slice(0, 5);
};

const template = new ResourceTemplate(
  "greetings://{name}",
  {
    list: undefined,
    complete: {
      name: completeName,
    },
  },
);

const config: ResourceMetadata = {
  mimeType: "text/plain",
};

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
  const sanitizedName = name
    .trim()
    .slice(0, 100)
    .replace(/[^\p{L}\p{N}\s\-']/gu, "");
  return {
    contents: [
      {
        uri: uri.toString(),
        text: `Hello, ${sanitizedName}! Welcome to MCP.`,
      },
    ],
  };
}

const module: ResourceTemplatePlugin = {
  type: "template",
  name,
  template,
  config,
  readCallback,
};

export default module;
