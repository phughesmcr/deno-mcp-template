import { JSONRPC_VERSION, type JSONRPCResponse } from "../vendor/schema.ts";
import { MCP_SERVER_NAME } from "../src/constants.ts";

export function GET(_req: Request): Response {
  const success: JSONRPCResponse = {
    jsonrpc: JSONRPC_VERSION,
    id: -1,
    result: {
      message:
        `${MCP_SERVER_NAME} is running. See \`/llms.txt\` for machine-readable documentation.`,
    },
  };
  return new Response(JSON.stringify(success), {
    status: 200,
    headers: {
      "Content-Type": "text/json",
    },
  });
}
