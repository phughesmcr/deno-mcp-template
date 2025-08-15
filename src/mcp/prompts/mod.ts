/**
 * @description Prompts: Pre-written templates that help users accomplish specific tasks
 * @module
 */
import type { PromptPlugin } from "$/shared/types.ts";
import codeReview from "./codeReview.ts";

export const prompts: PromptPlugin[] = [
  codeReview,
  // ... more prompts
] as const;
