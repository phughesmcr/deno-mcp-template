import type { ReadResourceResult, ResourceMetadata } from "@modelcontextprotocol/server";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";

const uri = "test://static-binary";

const config: ResourceMetadata = { mimeType: "application/octet-stream" };

function readCallback(): ReadResourceResult {
  return {
    contents: [{
      uri,
      mimeType: "application/octet-stream",
      blob: new Uint8Array([0, 1, 2, 3, 255]).toBase64(),
    }],
  };
}

const module: ResourcePlugin = {
  type: "resource",
  name: "conf-test-static-binary",
  uri,
  config,
  readCallback,
};

export default module;
