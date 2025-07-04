import { z } from "zod";

import { VALID_LOG_LEVELS } from "./constants.ts";

// Define the request schema for setLevels
export const SetLevelsRequestSchema = z.object({
  method: z.literal("logging/setLevels"),
  params: z.object({
    levels: z.record(z.string(), z.enum(VALID_LOG_LEVELS as [string, ...string[]]).nullable()),
  }),
});

// Define the request schema for setLevel
export const SetLevelRequestSchema = z.object({
  method: z.literal("logging/setLevel"),
  params: z.object({
    level: z.enum(VALID_LOG_LEVELS as [string, ...string[]]),
  }),
});
