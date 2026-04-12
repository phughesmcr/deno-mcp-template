import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v3";

import type { ToolModule } from "$/mcp/plugin-types.ts";

/** Minimal valid WAV (PCM, mono, 8kHz, 8-bit), base64 — satisfies `audio/wav` checks. */
const minimalWavBase64 = "UklGRi4AAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YRQBAAD//w==";

const schema = z.object({});

const tool: ToolModule<typeof schema.shape> = [
  "test_audio_content",
  {
    title: "Conformance audio",
    description: "Returns minimal WAV",
    inputSchema: schema.shape,
  },
  () => async (): Promise<CallToolResult> => ({
    content: [{
      type: "audio",
      data: minimalWavBase64,
      mimeType: "audio/wav",
    }],
  }),
];

export default tool;
