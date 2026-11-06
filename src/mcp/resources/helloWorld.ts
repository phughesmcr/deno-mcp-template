import type { ReadResourceResult } from "@modelcontextprotocol/server";

import type { ResourceConfig, ResourcePlugin } from "$/mcp/plugin-types.ts";

const name = "helloWorld";

const uri = "hello://world";

const config: ResourceConfig = {
  description: "A simple greeting message",
  mimeType: "text/plain",
  cacheHint: { ttlMs: 60 * 60 * 1000, cacheScope: "public" }, // The text never changes.
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
