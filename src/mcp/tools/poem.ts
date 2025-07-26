import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, CreateMessageRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolConfig, ToolModule } from "$/shared/types.ts";

const schema = z.object({
  msg: z.string().describe("The message to reflect"),
});

const name = "reflect";

// deno-lint-ignore no-explicit-any
const config: ToolConfig<typeof schema.shape, any> = {
  title: "Reflect",
  description: "Reflect a message",
  inputSchema: schema.shape,
};

const fewShot = [
  ["I want you to go to the moon with me", "You want me to go to the moon with you"],
  ["Jim said we should take you to the doctor", "Jim said you should take me to the doctor"],
  [
    "Who can tell if they think we're good enough?",
    "Who can tell if they think we're good enough?",
  ],
  ["I'm not sure if I'm good enough", "You're not sure if you're good enough"],
  ["You and I should take a trip", "You and I should take a trip"],
  ["What do you think I should do?", "What do I think you should do?"],
  ["This is your last chance to give us the money", "This is my last chance to give you the money"],
].flatMap(([user, assistant]): CreateMessageRequest["params"]["messages"] => {
  return [
    {
      role: "user",
      content: {
        type: "text",
        text: `reflect this message back to me:\n\n${user}`,
      },
    },
    {
      role: "assistant",
      content: {
        type: "text",
        text: `{"text": "${assistant}"}`,
      },
    },
  ];
});

// deno-lint-ignore no-explicit-any
const callback = (mcp: McpServer) => async (args: any): Promise<CallToolResult> => {
  // Parse and validate args with full type safety
  const parsed = schema.safeParse(args);

  if (!parsed.success) {
    return Promise.resolve({
      content: [{
        type: "text",
        text: "ERROR: Invalid arguments",
      }],
    });
  }

  const { msg } = parsed.data;

  // sampling
  const response = await mcp.server.createMessage({
    messages: [
      ...fewShot,
      {
        role: "user",
        content: {
          type: "text",
          text: `reflect this message back to me:\n\n${msg}`,
        },
      },
    ],
    maxTokens: 10000,
    temperature: 0.1,
    systemPrompt:
      `You are a helpful assistant that reflects messages back to the user with the same words but with the pronouns reversed (as if you were repeating it back to me as a question).
       Do not remove any words or change the meaning of the message, just flip the pronouns. 
       Keep punctuation and capitalization as is.
       Do not add any additional text or commentary.
       Respond only with valid JSON like so: {"text": "reflected message"}`,
  });

  if (response.content.type !== "text") {
    return Promise.resolve({
      content: [{
        _meta: {
          isError: true,
        },
        type: "text",
        text: "ERROR: No text response",
      }],
    });
  }

  return Promise.resolve({
    content: [{
      type: "text",
      text: response.content.text,
    }],
  });
};

// deno-lint-ignore no-explicit-any
const module: ToolModule<typeof schema.shape, any> = [
  name,
  config,
  callback,
];

export default module;
