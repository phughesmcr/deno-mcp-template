/**
 * Multi-round calls and change notifications, through the example tools over both transports.
 * Needs `--allow-run`, so `deno task test:integration` runs it in its second pass.
 */
import type { Client } from "@modelcontextprotocol/client";

import { assertEquals, waitFor } from "./helpers.ts";
import { createTestMcpHandler, mcpRequest } from "./mcpHttp.ts";
import { createClient, firstText, overHttp, overStdio } from "./mcpProtocol.ts";

const COUNTER_URI = "counter://value";

function createElicitingClient(): Client {
  const client = createClient({ elicitation: { form: {} } });
  client.setRequestHandler("elicitation/create", (request) => {
    const content: Record<string, string> = request.params.message.includes("name") ?
      { name: "Ada" } :
      { color: "teal" };
    return Promise.resolve({ action: "accept", content });
  });
  return client;
}

/** The behaviour both transports must share. */
async function exerciseDemos(client: Client): Promise<void> {
  const result = await client.callTool({
    name: "test_input_required_result_multi_round",
    arguments: {},
  });
  assertEquals(firstText(result), "Multi-round complete for Ada who likes teal");

  const received: string[] = [];
  client.setNotificationHandler("notifications/tools/list_changed", () => {
    received.push("tools");
  });
  client.setNotificationHandler("notifications/resources/updated", (notification) => {
    received.push(notification.params.uri);
  });
  const subscription = await client.listen({
    toolsListChanged: true,
    resourceSubscriptions: [COUNTER_URI],
  });

  await client.callTool({ name: "notify-list-changed", arguments: { target: "tools" } });
  await waitFor(() => received.includes("tools"), { timeoutMs: 5000 });

  const counted = await client.callTool({ name: "increment-counter", arguments: { delta: 1 } });
  const { delta, uri } = counted.structuredContent as { delta: number; uri: string };
  assertEquals(delta, 1);
  assertEquals(uri, COUNTER_URI);
  await waitFor(() => received.includes(COUNTER_URI), { timeoutMs: 5000 });

  await subscription.close();
}

Deno.test("example tools over HTTP", () => overHttp(createElicitingClient(), exerciseDemos));

Deno.test("example tools over stdio", () => overStdio(createElicitingClient(), exerciseDemos));

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const WRITES = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const EXPECTED_ANNOTATIONS: Record<string, Record<string, boolean>> = {
  "echo": READ_ONLY,
  "elicit-form-wizard": READ_ONLY,
  "elicit-input": READ_ONLY,
  "execute-code": { ...WRITES, idempotentHint: false },
  "fetch-website-info": { readOnlyHint: true, openWorldHint: true },
  "increment-counter": { ...WRITES, idempotentHint: false },
  "log-message": READ_ONLY,
  "notify-list-changed": { ...WRITES, idempotentHint: true },
  "poem": READ_ONLY,
  "url-elicitation-demo": { ...WRITES, idempotentHint: false },
};

Deno.test("every example tool declares its annotations", async () => {
  const response = await createTestMcpHandler().fetch(mcpRequest("tools/list"));
  const { result } = await response.json() as {
    result: { tools: { name: string; annotations?: Record<string, unknown> }[] };
  };
  const examples = result.tools.filter(({ name }) => !name.startsWith("test_"));
  assertEquals(examples.length, Object.keys(EXPECTED_ANNOTATIONS).length);
  for (const { name, annotations } of examples) {
    for (const [hint, value] of Object.entries(EXPECTED_ANNOTATIONS[name] ?? {})) {
      assertEquals(`${name} ${hint}: ${annotations?.[hint]}`, `${name} ${hint}: ${value}`);
    }
  }
});
