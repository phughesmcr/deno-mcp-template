import { completable } from "@modelcontextprotocol/server";
import { z } from "zod";

import { definePrompt } from "$/mcp/plugin-types.ts";

export default definePrompt({
  name: "test_prompt_with_arguments",
  title: "Conformance prompt with arguments",
  description: "test_prompt_with_arguments for MCP conformance",
  argsSchema: z.object({
    arg1: completable(z.string(), (value: string) => {
      const prefix = value.trim().toLowerCase();
      return ["testvalue1", "test", "other"]
        .filter((option) => option.startsWith(prefix))
        .slice(0, 10);
    }),
    arg2: z.string(),
  }),
  handler: ({ arg1, arg2 }) => ({
    messages: [{
      role: "user",
      content: { type: "text", text: `Prompt with arguments: arg1='${arg1}', arg2='${arg2}'` },
    }],
  }),
});
