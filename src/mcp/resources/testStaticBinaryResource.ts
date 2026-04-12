import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";

const uri = "test://static-binary";

const config: ResourceMetadata = { mimeType: "application/octet-stream" };

async function readCallback(): Promise<ReadResourceResult> {
  const bytes = new Uint8Array([0, 1, 2, 3, 255]);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }

  return {
    contents: [{
      uri,
      mimeType: "application/octet-stream",
      blob: btoa(binary),
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
