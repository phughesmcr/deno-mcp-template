/**
 * @description Prompts: Pre-written templates that help users accomplish specific tasks
 * @module
 */
import type { PromptPlugin } from "$/mcp/plugin-types.ts";
import codeReview from "./codeReview.ts";
import languagePrompt from "./languagePrompt.ts";
import testPromptWithArguments from "./testPromptWithArguments.ts";
import testPromptWithEmbeddedResource from "./testPromptWithEmbeddedResource.ts";
import testPromptWithImage from "./testPromptWithImage.ts";
import testSimplePrompt from "./testSimplePrompt.ts";

export const prompts: PromptPlugin[] = [
  codeReview,
  languagePrompt,
  testSimplePrompt,
  testPromptWithArguments,
  testPromptWithEmbeddedResource,
  testPromptWithImage,
] as const;
