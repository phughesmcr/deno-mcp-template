import type { JSONRPCResponse } from "../vendor/schema.ts";

export function GET(_req: Request): Response {
  const success: JSONRPCResponse = {
    jsonrpc: "2.0",
    id: 0,
    result: {
      message: "MCP SSE Server is running",
    },
  };
  return new Response(JSON.stringify(success), {
    status: 200,
    headers: {
      "Content-Type": "text/json",
    },
  });
}
