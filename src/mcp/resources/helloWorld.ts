/**
 * @type {import("../types.ts").ResourceModule}
 * @module
 */

import type { ReadResourceResult, Resource } from "@vendor/schema";
import type { ResourceModule } from "../../types.ts";

const resource: Resource = {
  uri: "hello://world",
  name: "Hello World Message",
  description: "A simple greeting message",
  mimeType: "text/plain",
};

const request = async (): Promise<ReadResourceResult> => ({
  contents: [
    {
      uri: "hello://world",
      text: "Hello, World! This is my first MCP resource.",
    },
  ],
});

export const helloWorld: ResourceModule = {
  resource,
  request,
};
