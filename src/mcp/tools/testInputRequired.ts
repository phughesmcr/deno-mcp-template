/**
 * @description Conformance fixtures for `input_required` results (multi-round tool calls).
 * Tool names, input keys and result text are fixed by the conformance suite.
 * @module
 */

import {
  acceptedContent,
  CLIENT_CAPABILITIES_META_KEY,
  type ClientCapabilities,
  inputRequired,
} from "@modelcontextprotocol/server";
import { z } from "zod";

import { rootCount, samplingText, text } from "$/mcp/inputResponses.ts";
import { defineTool, type ToolPlugin } from "$/mcp/plugin-types.ts";

const noArgs = z.object({});
const nameForm = z.object({ name: z.string() });
const colorForm = z.object({ color: z.string() });
const confirmForm = z.object({ ok: z.boolean() });
const valueForm = z.object({ value: z.string() });

const askName = () =>
  inputRequired.elicit({ message: "What is your name?", requestedSchema: nameForm });

const askConfirm = () =>
  inputRequired.elicit({ message: "Please confirm", requestedSchema: confirmForm });

const sample = (text: string, maxTokens: number) =>
  inputRequired.createMessage({
    messages: [{ role: "user", content: { type: "text", text } }],
    maxTokens,
  });

/** Payload every fixture signs into `requestState`. */
type FixtureState = { kind: string; name?: string };

const elicitation = defineTool({
  name: "test_input_required_result_elicitation",
  description: "Asks for a name, then greets it",
  inputSchema: noArgs,
  handler: (_args, ctx) => {
    const answer = acceptedContent(ctx.mcpReq.inputResponses, "user_name", nameForm);
    if (answer) return text(`Hello, ${answer.name}!`);
    return inputRequired({ inputRequests: { user_name: askName() } });
  },
});

const sampling = defineTool({
  name: "test_input_required_result_sampling",
  description: "Asks the client to sample, then reports the answer",
  inputSchema: noArgs,
  handler: (_args, ctx) => {
    const answer = samplingText(ctx, "capital_question");
    if (answer !== undefined) return text(`Sampling result: ${answer}`);
    return inputRequired({
      inputRequests: { capital_question: sample("What is the capital of France?", 100) },
    });
  },
});

const listRoots = defineTool({
  name: "test_input_required_result_list_roots",
  description: "Asks for the client's roots, then counts them",
  inputSchema: noArgs,
  handler: (_args, ctx) => {
    const roots = rootCount(ctx, "client_roots");
    if (roots !== undefined) return text(`Found ${roots} root(s)`);
    return inputRequired({ inputRequests: { client_roots: inputRequired.listRoots() } });
  },
});

const requestStateFixture = defineTool({
  name: "test_input_required_result_request_state",
  description: "Round-trips signed requestState",
  inputSchema: noArgs,
  handler: async (_args, ctx, { requestState }) => {
    const state = ctx.mcpReq.requestState<FixtureState>();
    const answer = acceptedContent(ctx.mcpReq.inputResponses, "confirm", confirmForm);
    if (state?.kind === "request-state" && answer) return text("state-ok: requestState validated");
    return inputRequired({
      inputRequests: { confirm: askConfirm() },
      requestState: await requestState.mint({ kind: "request-state" }, ctx),
    });
  },
});

const multipleInputs = defineTool({
  name: "test_input_required_result_multiple_inputs",
  description: "Requests elicitation, sampling and roots in one round",
  inputSchema: noArgs,
  handler: async (_args, ctx, { requestState }) => {
    const state = ctx.mcpReq.requestState<FixtureState>();
    const answer = acceptedContent(ctx.mcpReq.inputResponses, "user_name", nameForm);
    const greeting = samplingText(ctx, "greeting");
    const roots = rootCount(ctx, "client_roots");
    if (
      state?.kind === "multiple-inputs" && answer && greeting !== undefined && roots !== undefined
    ) {
      return text(`Name: ${answer.name}; Greeting: ${greeting}; Roots: ${roots}`);
    }
    return inputRequired({
      inputRequests: {
        user_name: askName(),
        greeting: sample("Generate a greeting", 50),
        client_roots: inputRequired.listRoots(),
      },
      requestState: await requestState.mint({ kind: "multiple-inputs" }, ctx),
    });
  },
});

const multiRound = defineTool({
  name: "test_input_required_result_multi_round",
  description: "Collects a name and a colour over two rounds",
  inputSchema: noArgs,
  handler: async (_args, ctx, { requestState }) => {
    const responses = ctx.mcpReq.inputResponses;
    const state = ctx.mcpReq.requestState<FixtureState>();
    const name = state?.name ?? acceptedContent(responses, "step1", nameForm)?.name;

    if (name === undefined) {
      return inputRequired({
        inputRequests: {
          step1: inputRequired.elicit({
            message: "Step 1: What is your name?",
            requestedSchema: nameForm,
          }),
        },
        requestState: await requestState.mint({ kind: "multi-round" }, ctx),
      });
    }

    const answer = acceptedContent(responses, "step2", colorForm);
    if (answer) return text(`Multi-round complete for ${name} who likes ${answer.color}`);

    return inputRequired({
      inputRequests: {
        step2: inputRequired.elicit({
          message: "Step 2: What is your favorite color?",
          requestedSchema: colorForm,
        }),
      },
      requestState: await requestState.mint({ kind: "multi-round", name }, ctx),
    });
  },
});

const tamperedState = defineTool({
  name: "test_input_required_result_tampered_state",
  description: "Rejects tampered requestState (the verify hook answers -32602)",
  inputSchema: noArgs,
  handler: async (_args, ctx, { requestState }) => {
    const state = ctx.mcpReq.requestState<FixtureState>();
    const answer = acceptedContent(ctx.mcpReq.inputResponses, "confirm", confirmForm);
    if (state?.kind === "tamper-test" && answer) return text("integrity-ok: state verified");
    return inputRequired({
      inputRequests: { confirm: askConfirm() },
      requestState: await requestState.mint({ kind: "tamper-test" }, ctx),
    });
  },
});

const capabilities = defineTool({
  name: "test_input_required_result_capabilities",
  description: "Only requests input the client declared support for",
  inputSchema: noArgs,
  handler: (_args, ctx) => {
    const responses = ctx.mcpReq.inputResponses ?? {};
    const received = Object.keys(responses);
    if (received.length > 0) return text(`capabilities-ok: received ${received.join(",")}`);

    const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
    const declared = envelope?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined;
    const inputRequests = {
      ...(declared?.elicitation ?
        {
          elicit_input: inputRequired.elicit({
            message: "Elicitation input",
            requestedSchema: valueForm,
          }),
        } :
        {}),
      ...(declared?.sampling ? { sample_input: sample("Sample request", 50) } : {}),
    };
    if (Object.keys(inputRequests).length === 0) {
      return text("No supported capabilities declared");
    }
    return inputRequired({ inputRequests });
  },
});

export const testInputRequiredTools: readonly ToolPlugin[] = [
  elicitation,
  sampling,
  listRoots,
  requestStateFixture,
  multipleInputs,
  multiRound,
  tamperedState,
  capabilities,
];
