import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourceTemplatePlugin } from "$/mcp/plugin-types.ts";

const templateUri = "test://template/{id}/data";

const config: ResourceMetadata = { mimeType: "text/plain" };
const template = new ResourceTemplate(templateUri, { list: undefined });

async function readCallback(
  uri: URL,
  variables: Record<string, unknown>,
): Promise<ReadResourceResult> {
  const id = String(variables.id ?? "");
  return {
    contents: [{
      uri: uri.toString(),
      mimeType: "text/plain",
      text: `Template resource for id=${id} (value ${id} must appear).`,
    }],
  };
}

const module: ResourceTemplatePlugin = {
  type: "template",
  name: "conf-test-template",
  template,
  config,
  readCallback,
};

export default module;
