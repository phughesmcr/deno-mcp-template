import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";

const uri = "test://static-text";

const config: ResourceMetadata = { mimeType: "text/plain" };

async function readCallback(): Promise<ReadResourceResult> {
  return {
    contents: [{
      uri,
      mimeType: "text/plain",
      text: "Static text for conformance.",
    }],
  };
}

const module: ResourcePlugin = {
  type: "resource",
  name: "conf-test-static-text",
  uri,
  config,
  readCallback,
};

export default module;
