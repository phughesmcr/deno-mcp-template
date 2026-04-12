import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";

const uri = "test://watched-resource";

const config: ResourceMetadata = { mimeType: "text/plain" };

async function readCallback(): Promise<ReadResourceResult> {
  return {
    contents: [{
      uri,
      mimeType: "text/plain",
      text: "watched",
    }],
  };
}

const module: ResourcePlugin = {
  type: "resource",
  name: "conf-test-watched",
  uri,
  config,
  readCallback,
};

export default module;
