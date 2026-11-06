import type { ReadResourceResult, ResourceMetadata } from "@modelcontextprotocol/server";

import type { ResourcePlugin } from "$/mcp/plugin-types.ts";
import { getPersistedCounterValue } from "./counterStore.ts";

export const COUNTER_URI = "counter://value";

const name = "counter";

const config: ResourceMetadata = {
  description: "A KV-backed counter resource",
  mimeType: "application/json",
};

const readCallback: ResourcePlugin["readCallback"] = async (
  _uri,
  _ctx,
  { kv },
): Promise<ReadResourceResult> => {
  const value = await getPersistedCounterValue(kv);
  return {
    contents: [
      {
        uri: COUNTER_URI,
        text: JSON.stringify({ value }),
      },
    ],
  };
};

const module: ResourcePlugin = {
  type: "resource",
  name,
  uri: COUNTER_URI,
  config,
  readCallback,
};

export default module;
