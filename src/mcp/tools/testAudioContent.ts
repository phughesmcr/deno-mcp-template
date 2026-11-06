import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import { defineTool } from "$/mcp/plugin-types.ts";

/** Minimal valid WAV (PCM, mono, 8kHz, 8-bit), base64 — satisfies `audio/wav` checks. */
const minimalWavBase64 = "UklGRi4AAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YRQBAAD//w==";

export default defineTool({
  name: "test_audio_content",
  title: "Conformance audio",
  description: "Returns minimal WAV",
  inputSchema: z.object({}),
  handler: (): CallToolResult => ({
    content: [{
      type: "audio",
      data: minimalWavBase64,
      mimeType: "audio/wav",
    }],
  }),
});
