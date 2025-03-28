import { JSONRPC_VERSION } from "../vendor/schema.ts";
import { MCP_SERVER_NAME } from "../src/constants.ts";
import { createSuccessResponse } from "../src/utils.ts";

export function GET(_req: Request): Response {
  const id = -1;
  const message = `${MCP_SERVER_NAME} running. See \`/llms.txt\` for machine-readable docs.`;
  return createSuccessResponse(id, {
    jsonrpc: JSONRPC_VERSION,
    id,
    result: { message },
  });
}
