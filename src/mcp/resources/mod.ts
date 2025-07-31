/**
 * @description Resources: File-like data that can be read by clients (like API responses or file contents)
 * @see {@link https://modelcontextprotocol.io/docs/concepts/resources}
 * @module
 */

import type { ResourcePlugin, ResourceTemplatePlugin } from "$/shared/types.ts";

import greetings from "./greetings.ts";
import helloWorld from "./helloWorld.ts";

export const resources: (ResourcePlugin | ResourceTemplatePlugin)[] = [
  greetings,
  helloWorld,
  // ... more resources
];
