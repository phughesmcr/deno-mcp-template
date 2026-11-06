#!/usr/bin/env -S deno run -A

/**
 * @description Smoke-tests a compiled server binary: sends `server/discover` over stdio
 * @usage       deno run -A scripts/smoke-binary.ts <path-to-binary>
 * @license     MIT
 * @module
 */

const VERSION = "2026-07-28";

async function main(): Promise<void> {
  const bin = Deno.args[0];
  if (!bin) throw new Error("usage: smoke-binary.ts <binary>");
  const kv = await Deno.makeTempFile({ suffix: ".kv" });
  const child = new Deno.Command(bin, {
    args: ["--no-http"],
    env: { MCP_KV_PATH: kv },
    stdin: "piped",
    stdout: "piped",
    stderr: "inherit",
  }).spawn();

  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "server/discover",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }) + "\n",
  ));

  const timer = setTimeout(() => child.kill(), 30_000);
  let buf = "";
  let line: string | undefined;
  const decoder = new TextDecoder();
  try {
    for await (const chunk of child.stdout) {
      buf += decoder.decode(chunk, { stream: true });
      const i = buf.indexOf("\n");
      if (i >= 0) {
        line = buf.slice(0, i);
        break;
      }
    }
  } finally {
    clearTimeout(timer);
    try {
      child.kill();
    } catch { /* already exited */ }
    await child.status;
    await Deno.remove(kv).catch(() => {});
  }

  if (!line) throw new Error("no response from binary");
  const supported = JSON.parse(line)?.result?.supportedVersions;
  if (!Array.isArray(supported) || !supported.includes(VERSION)) {
    throw new Error(`supportedVersions lacks ${VERSION}: ${line}`);
  }
  console.log(`OK ${bin}: supportedVersions=${JSON.stringify(supported)}`);
}

if (import.meta.main) {
  await main();
}
