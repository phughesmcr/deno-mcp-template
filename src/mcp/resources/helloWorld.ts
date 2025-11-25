import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourcePlugin } from "$/shared/types.ts";

const name = "helloWorld";

const uriOrTemplate = "hello://world";

const config: ResourceMetadata = {
  description: "A simple greeting message",
  mimeType: "text/plain",
};

async function readCallback(): Promise<ReadResourceResult> {
  return {
    contents: [
      {
        uri: uriOrTemplate,
        text: "Hello, World! This is my first MCP resource.",
      },
    ],
  };
}

const module: ResourcePlugin = [
  name,
  uriOrTemplate,
  config,
  readCallback,
];

export default module;
