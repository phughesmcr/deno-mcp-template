import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { PromptPlugin } from "$/mcp/plugin-types.ts";

const schema = z.object({
  arg1: completable(z.string(), (value: string) => {
    const v = value.trim().toLowerCase();
    return ["testvalue1", "test", "other"].filter((s) => s.toLowerCase().startsWith(v)).slice(
      0,
      10,
    );
  }),
  arg2: z.string(),
});

const prompt: PromptPlugin = [
  "test_prompt_with_arguments",
  {
    title: "Conformance prompt with arguments",
    description: "test_prompt_with_arguments for MCP conformance",
    argsSchema: schema.shape,
  },
  async (args: Record<string, unknown>): Promise<GetPromptResult> => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }
    const { arg1, arg2 } = parsed.data;
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Prompt with arguments: arg1='${arg1}', arg2='${arg2}'`,
        },
      }],
    };
  },
];

export default prompt;
