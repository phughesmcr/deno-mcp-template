import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";
import { TEST_EMBEDDED_RESOURCE_URI } from "$/mcp/showcase/sharedConstants.ts";

const config: ResourceMetadata = { mimeType: "text/plain" };

async function readCallback(): Promise<ReadResourceResult> {
  return {
    contents: [{
      uri: TEST_EMBEDDED_RESOURCE_URI,
      mimeType: "text/plain",
      text: "Embedded body",
    }],
  };
}

const module: ResourcePlugin = {
  type: "resource",
  name: "conf-test-embedded-res",
  uri: TEST_EMBEDDED_RESOURCE_URI,
  config,
  readCallback,
};

export default module;
