import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import type { ResourcePlugin } from "$/shared/types.ts";
import { getPersistedCounterValue, incrementPersistedCounterValue } from "./counterStore.ts";

export const COUNTER_URI = "counter://value";

export async function incrementCounterValue(delta: number): Promise<number> {
  return await incrementPersistedCounterValue(delta);
}

export async function getCounterValue(): Promise<number> {
  return await getPersistedCounterValue();
}

const name = "counter";

const config: ResourceMetadata = {
  description: "A KV-backed counter resource",
  mimeType: "application/json",
};

async function readCallback(): Promise<ReadResourceResult> {
  const value = await getCounterValue();
  return {
    contents: [
      {
        uri: COUNTER_URI,
        text: JSON.stringify({ value }),
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
