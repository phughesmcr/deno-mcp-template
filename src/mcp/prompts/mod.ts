/**
 * @description Prompts: Pre-written templates that help users accomplish specific tasks
 * @module
 */

import type {
  GetPromptRequest,
  GetPromptResult,
  ListPromptsResult,
} from "@modelcontextprotocol/sdk/types.js";

import type { PromptModule } from "$/shared/types.ts";
import { codeReview } from "./codeReview.ts";

// deno-lint-ignore no-explicit-any
const prompts: PromptModule<any>[] = [
  codeReview,
  // ... more prompts
] as const;

/** List all available prompts */
export const listPrompts = async (): Promise<ListPromptsResult> => ({
  prompts: prompts.map((prompt) => prompt.prompt),
});

/** Handle a prompt request */
export const getPrompt = async (
  request: GetPromptRequest,
): Promise<GetPromptResult> => {
  const { name, arguments: args } = request.params;
  const prompt = prompts.find((prompt) => prompt.prompt.name === name);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  return prompt.request(args);
};
