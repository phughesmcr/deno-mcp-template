/**
 * @type {import("../types.ts").ResourceTemplateModule}
 * @module
 */

import type { ReadResourceResult, ResourceTemplate } from "@vendor/schema";

export const resourceTemplate: ResourceTemplate = {
  uriTemplate: "greetings://{name}",
  name: "Personal Greeting",
  description: "A personalized greeting message",
  mimeType: "text/plain",
};

export const request = async (
  request: { params: { uri: string } },
  greetingMatch: RegExpMatchArray | null,
): Promise<ReadResourceResult> => {
  if (!greetingMatch) {
    throw new Error("Invalid URI");
  }

  const name = decodeURIComponent(greetingMatch[1] ?? "");
  return {
    contents: [
      {
        uri: request.params.uri,
        text: `Hello, ${name}! Welcome to MCP.`,
      },
    ],
  };
};
