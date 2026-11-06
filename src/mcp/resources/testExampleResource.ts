import type { ReadResourceResult, ResourceMetadata } from "@modelcontextprotocol/server";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";

const uri = "test://example-resource";

const config: ResourceMetadata = { mimeType: "text/plain" };

async function readCallback(): Promise<ReadResourceResult> {
  return {
    contents: [{
      uri,
      mimeType: "text/plain",
      text: "Embedded resource content for testing.",
    }],
  };
}

const module: ResourcePlugin = {
  type: "resource",
  name: "conf-test-example",
  uri,
  config,
  readCallback,
};

export default module;
