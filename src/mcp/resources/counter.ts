import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourcePlugin } from "$/shared/types.ts";

export const COUNTER_URI = "counter://value";

let counterValue = 0;

export function incrementCounterValue(delta: number): number {
  counterValue += delta;
  return counterValue;
}

export function getCounterValue(): number {
  return counterValue;
}

const name = "counter";

const config: ResourceMetadata = {
  description: "A simple in-memory counter resource",
  mimeType: "application/json",
};

async function readCallback(): Promise<ReadResourceResult> {
  return {
    contents: [
      {
        uri: COUNTER_URI,
        text: JSON.stringify({ value: counterValue }),
      },
    ],
  };
}

const module: ResourcePlugin = {
  type: "resource",
  name,
  uri: COUNTER_URI,
  config,
  readCallback,
};

export default module;
