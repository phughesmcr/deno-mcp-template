/**
 * @description Zod validation schemas for prompt validation
 * @module
 */

import { z } from "zod";

export const PromptArgsSchema = z.object({
  code: z.string().min(1, "Code required").max(50000, "Code too long"),
});
