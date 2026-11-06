import type { ReadResourceResult, ResourceMetadata } from "@modelcontextprotocol/server";
import { ResourceTemplate } from "@modelcontextprotocol/server";

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
