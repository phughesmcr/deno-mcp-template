/**
 * @description Resources: File-like data that can be read by clients (like API responses or file contents)
 * @see {@link https://modelcontextprotocol.io/docs/concepts/resources}
 * @module
 */

import type { AnyResourcePlugin } from "$/mcp/plugin-types.ts";

import counter from "./counter.ts";
import greetings from "./greetings.ts";
import helloWorld from "./helloWorld.ts";
import testEmbeddedResourceResource from "./testEmbeddedResourceResource.ts";
import testExampleResource from "./testExampleResource.ts";
import testMixedContentResource from "./testMixedContentResource.ts";
import testStaticBinaryResource from "./testStaticBinaryResource.ts";
import testStaticTextResource from "./testStaticTextResource.ts";
import testTemplateResource from "./testTemplateResource.ts";
import testWatchedResource from "./testWatchedResource.ts";

export const resources: AnyResourcePlugin[] = [
  counter,
  greetings,
  helloWorld,
  testStaticTextResource,
  testStaticBinaryResource,
  testWatchedResource,
  testExampleResource,
  testEmbeddedResourceResource,
  testMixedContentResource,
  testTemplateResource,
];
