import {
  type CompleteResourceTemplateCallback,
  ProtocolError,
  ProtocolErrorCode,
  type ReadResourceResult,
  type ResourceMetadata,
  ResourceTemplate,
  type Variables,
} from "@modelcontextprotocol/server";

import type { ResourceTemplatePlugin } from "$/mcp/plugin-types.ts";

const name = "greetings";

const nameSuggestions = [
  "Ada",
  "Alan",
  "Grace",
  "Linus",
  "Margaret",
  "Ken",
];

const completeName: CompleteResourceTemplateCallback = (value: string) => {
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

function readCallback(uri: URL, variables: Variables): ReadResourceResult {
  const { name } = variables;
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new ProtocolError(
      ProtocolErrorCode.InvalidParams,
      "Name parameter is required and must be a non-empty string",
    );
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
