/**
 * @description Resources: File-like data that can be read by clients (like API responses or file contents)
 * @see {@link https://modelcontextprotocol.io/docs/concepts/resources}
 * @module
 */

import type { ResourceModule, ResourceTemplateModule } from "../../types.ts";
import * as greetings from "./greetings.ts";
import * as helloWorld from "./helloWorld.ts";

const resources: ResourceModule[] = [
  helloWorld,
] as const;

// deno-lint-ignore no-explicit-any
const resourceTemplates: ResourceTemplateModule<any>[] = [
  greetings,
] as const;

/** List all resources */
export const handleListResourcesRequest = async () => {
  return {
    resources: resources.map((r) => r.resource),
  };
};

/** List all resource templates */
export const handleListResourceTemplatesRequest = async () => ({
  resourceTemplates: resourceTemplates.map((r) => r.resourceTemplate),
});

/** Read a resource */
export const handleReadResourceRequest = async (request: {
  params: { uri: string };
}) => {
  // Direct resources
  const resource = resources.find((r) => r.resource.uri === request.params.uri);
  if (resource) {
    return await resource.request();
  }

  // Template resources
  const greetingExp = /^greetings:\/\/(.+)$/;
  const greetingMatch = request.params.uri.match(greetingExp);
  if (greetingMatch) {
    return await greetings.request(request, greetingMatch);
  }

  throw new Error("Resource not found");
};
