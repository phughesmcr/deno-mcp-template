/**
 * @type {import("../types.ts").ResourceTemplateModule}
 * @module
 */

import type { ReadResourceResult, ResourceTemplate } from "@vendor/schema";
import type { ResourceTemplateModule } from "../../types.ts";

const resourceTemplate: ResourceTemplate = {
  uriTemplate: "greetings://{name}",
  name: "Personal Greeting",
  description: "A personalized greeting message",
  mimeType: "text/plain",
};

const request = async (
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

export const greetings: ResourceTemplateModule<RegExpMatchArray | null> = {
  resourceTemplate,
  request,
};
