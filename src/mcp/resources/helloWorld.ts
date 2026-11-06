import type { ReadResourceResult, ResourceMetadata } from "@modelcontextprotocol/server";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";

const name = "helloWorld";

const uri = "hello://world";

const config: ResourceMetadata = {
  description: "A simple greeting message",
  mimeType: "text/plain",
};

async function readCallback(): Promise<ReadResourceResult> {
  return {
    contents: [
      {
        uri,
        text: "Hello, World! This is my first MCP resource.",
      },
    ],
  };
}

const module: ResourcePlugin = {
  type: "resource",
  name,
  uri,
  config,
  readCallback,
};

export default module;
