/**
 * What a 2025-era client gets from the example features under `--legacy-stdio`: the SDK turns each
 * `inputRequired` result into a real server-to-client request. Needs `--allow-run`, so
 * `deno task test:integration` runs it in its second pass.
 */
import type { Client } from "@modelcontextprotocol/client";
import { delay } from "@std/async/delay";

import { FETCH_WEBSITE_INFO_RESOURCE_URI as uri } from "$/mcp/apps/fetchWebsiteInfoApp.ts";
import { assert, assertEquals, waitFor } from "./helpers.ts";
import { createLegacyClient, firstText, overStdio } from "./mcpProtocol.ts";

const COUNTER_URI = "counter://value";

const overLegacyStdio = (client: Client, exercise: (client: Client) => Promise<void>) =>
  overStdio(client, exercise, ["--legacy-stdio"]);

function createAnsweringClient(): Client {
  const client = createLegacyClient({ elicitation: { form: {} }, sampling: {}, roots: {} });
  client.setRequestHandler("elicitation/create", (request) => {
    const { message } = request.params;
    const content: Record<string, string | boolean> = message.includes("confirm") ?
      { ok: true } :
      message.includes("name") ?
      { name: "Ada" } :
      { color: "teal" };
    return Promise.resolve({ action: "accept", content });
  });
  client.setRequestHandler("sampling/createMessage", () =>
    Promise.resolve({
      role: "assistant",
      content: { type: "text", text: "Roses are red" },
      model: "test-model",
    }));
  client.setRequestHandler("roots/list", () => Promise.resolve({ roots: [] }));
  return client;
}

Deno.test("multi-round tools and prompts reach a 2025-era client", () =>
  overLegacyStdio(createAnsweringClient(), async (client) => {
    const rounds = await client.callTool({
      name: "test_input_required_result_multi_round",
      arguments: {},
    });
    assertEquals(firstText(rounds), "Multi-round complete for Ada who likes teal");

    const sampled = await client.callTool({ name: "poem", arguments: { prompt: "flowers" } });
    assertEquals((sampled.structuredContent as { poem: string }).poem, "Roses are red");

    const roots = await client.callTool({
      name: "test_input_required_result_list_roots",
      arguments: {},
    });
    assertEquals(firstText(roots), "Found 0 root(s)");

    const signed = await client.callTool({
      name: "test_input_required_result_request_state",
      arguments: {},
    });
    assertEquals(firstText(signed), "state-ok: requestState validated");
  }));

Deno.test("a 2025-era client can decline an elicitation", () => {
  const client = createLegacyClient({ elicitation: { form: {} } });
  client.setRequestHandler("elicitation/create", () => Promise.resolve({ action: "decline" }));
  return overLegacyStdio(client, async () => {
    const result = await client.callTool({ name: "elicit-input", arguments: { purpose: "demo" } });
    assertEquals(firstText(result), JSON.stringify({ cancelled: true }));
  });
});

Deno.test("input a 2025-era client cannot give fails with a clear message", () =>
  overLegacyStdio(createLegacyClient(), async (client) => {
    const tool = await client.callTool({ name: "poem", arguments: { prompt: "flowers" } });
    assert(tool.isError === true, "a tool needing sampling should fail");
    assert(firstText(tool).includes("did not declare the required capability"), firstText(tool));

    const prompt = await client.getPrompt({
      name: "test_input_required_result_prompt",
      arguments: {},
    }).then(() => "", (error) => String(error));
    assert(prompt.includes("did not declare the required capability"), prompt);
  }));

Deno.test("the URL elicitation demo reports that HTTP is off", () =>
  overLegacyStdio(createLegacyClient(), async (client) => {
    const result = await client.callTool({
      name: "url-elicitation-demo",
      arguments: { label: "demo" },
    });
    assert(result.isError === true, "the demo needs the HTTP server");
    assert(firstText(result).includes("HTTP is disabled"), firstText(result));
  }));

Deno.test("a 2025-era client receives list changes and logs", () =>
  overLegacyStdio(createLegacyClient(), async (client) => {
    const received: string[] = [];
    client.setNotificationHandler("notifications/tools/list_changed", () => {
      received.push("tools");
    });
    client.setNotificationHandler("notifications/message", () => {
      received.push("log");
    });

    await client.callTool({ name: "notify-list-changed", arguments: { target: "tools" } });
    await waitFor(() => received.includes("tools"), { timeoutMs: 5000 });

    await client.setLoggingLevel("info");
    await client.callTool({ name: "log-message", arguments: { message: "hello" } });
    await waitFor(() => received.includes("log"), { timeoutMs: 5000 });
  }));

Deno.test("a 2025-era client hears about a resource only while subscribed", () =>
  overLegacyStdio(createLegacyClient(), async (client) => {
    let updates = 0;
    client.setNotificationHandler("notifications/resources/updated", () => {
      updates++;
    });
    const increment = () => client.callTool({ name: "increment-counter", arguments: {} });

    await increment();
    await delay(300);
    assertEquals(updates, 0);

    await client.subscribeResource({ uri: COUNTER_URI });
    await increment();
    await waitFor(() => updates === 1, { timeoutMs: 5000 });

    await client.unsubscribeResource({ uri: COUNTER_URI });
    await increment();
    await delay(300);
    assertEquals(updates, 1);
  }));

Deno.test("a 2025-era client can read the MCP App resource", () =>
  overLegacyStdio(createLegacyClient(), async (client) => {
    const { contents } = await client.readResource({ uri });
    assertEquals(contents[0]?.uri, uri);
  }));
