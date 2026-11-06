/**
 * @description Tools: Functions that can be called by the LLM (with user approval)
 * @see {@link https://github.com/modelcontextprotocol/servers/tree/main/src/memory}
 * @module
 */

import type { ToolPlugin } from "$/mcp/plugin-types.ts";
import elicitFormWizard from "./elicitFormWizard.ts";
import elicitInput from "./elicitInput.ts";
import incrementCounter from "./incrementCounter.ts";
import logMessage from "./logMessage.ts";
import notifyListChanged from "./notifyListChanged.ts";
import poem from "./poem.ts";
import sandbox from "./sandbox.ts";
import testAudioContent from "./testAudioContent.ts";
import testEmbeddedResource from "./testEmbeddedResource.ts";
import testErrorHandling from "./testErrorHandling.ts";
import testImageContent from "./testImageContent.ts";
import { testDiagnosticTools } from "./testDiagnostics.ts";
import { testInputRequiredTools } from "./testInputRequired.ts";
import testMultipleContentTypes from "./testMultipleContentTypes.ts";
import testSimpleText from "./testSimpleText.ts";
import testToolWithLogging from "./testToolWithLogging.ts";
import testToolWithProgress from "./testToolWithProgress.ts";
import urlElicitationDemo from "./urlElicitationDemo.ts";

export const tools: readonly ToolPlugin[] = [
  elicitInput, // Form elicitation
  elicitFormWizard, // Multi-round form elicitation with signed state
  urlElicitationDemo, // URL-mode elicitation
  incrementCounter, // Resource updates + subscriptions
  logMessage, // Logging notification example
  notifyListChanged, // List-changed notification example
  poem, // Sampling
  sandbox, // Sandboxed code execution
  testSimpleText,
  testImageContent,
  testAudioContent,
  testEmbeddedResource,
  testMultipleContentTypes,
  testToolWithLogging,
  testErrorHandling,
  testToolWithProgress,
  ...testInputRequiredTools,
  ...testDiagnosticTools,
];
