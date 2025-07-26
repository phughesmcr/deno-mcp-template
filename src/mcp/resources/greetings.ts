import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ReadResourceResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

import type { ResourcePlugin } from "$/shared/types.ts";

const name = "greetings";

const uriOrTemplate = new ResourceTemplate("greetings://{name}", { list: undefined });

const config: ResourceMetadata = {};

async function readCallback(
  uri: URL,
  variables: Record<string, unknown>,
  _extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): Promise<ReadResourceResult> {
  const _name = uri.toString().match(/^greetings:\/\/(.+)$/);
  if (!_name) {
    throw new Error("Invalid URI");
  }
  const name = (variables.name as string) ?? _name[1];
  return {
    contents: [
      {
        uri: uri.toString(),
        text: `Hello, ${name}! Welcome to MCP.`,
      },
    ],
  };
}

const module: ResourcePlugin = [
  name,
  uriOrTemplate,
  config,
  readCallback,
];

export default module;
