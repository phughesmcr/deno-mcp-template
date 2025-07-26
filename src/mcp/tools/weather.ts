import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";

const schema = z.object({
  city: z.string().describe("The city to fetch weather for"),
});

const name = "fetch-weather";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Weather Fetcher",
  description: "Get weather data for a city",
  inputSchema: schema.shape,
};

// deno-lint-ignore no-explicit-any
const callback = (_mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  const { city } = args;
  const response = await fetch(`https://api.weather.com/${city}`);
  const data = await response.text();
  return {
    content: [{ type: "text", text: data }],
  };
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [
  name,
  config,
  callback,
];

export default module;
