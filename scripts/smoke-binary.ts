#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net=localhost --allow-run

/**
 * @description Smoke-tests a compiled server binary: `server/discover` over stdio, then `/llms.txt`
 * over HTTP from another folder, which only works if `static/` is inside the binary
 * @usage       deno run --allow-read --allow-write --allow-net=localhost --allow-run=<binary> scripts/smoke-binary.ts <binary>
 * @license     MIT
 * @module
 */

import { resolve } from "@std/path";

import { discoverRequest, MCP_PROTOCOL_VERSION } from "./discover.ts";

const TIMEOUT_MS = 30_000;
const POLL_MS = 250;
const REQUEST_TIMEOUT_MS = 5_000;

function stop(child: Deno.ChildProcess): Promise<Deno.CommandStatus> {
  try {
    child.kill();
  } catch { /* already exited */ }
  return child.status;
}

/** @returns The first line the binary prints in reply to `server/discover` */
async function readDiscoverReply(
  bin: string,
  kv: string,
  timeoutMs: number,
): Promise<string | undefined> {
  const child = new Deno.Command(bin, {
    args: ["--no-http"],
    env: { MCP_KV_PATH: kv },
    stdin: "piped",
    stdout: "piped",
    stderr: "inherit",
  }).spawn();
  const timer = setTimeout(() => stop(child), timeoutMs);
  const decoder = new TextDecoder();
  const writer = child.stdin.getWriter();
  let buffer = "";
  try {
    await writer.write(new TextEncoder().encode(discoverRequest() + "\n"));
    for await (const chunk of child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      const end = buffer.indexOf("\n");
      if (end >= 0) return buffer.slice(0, end);
    }
    return undefined;
  } finally {
    clearTimeout(timer);
    await writer.close().catch(() => {});
    await stop(child);
  }
}

function freePort(): number {
  const listener = Deno.listen({ hostname: "localhost", port: 0 });
  const { port } = listener.addr;
  listener.close();
  return port;
}

/** Throws unless the binary serves `/llms.txt` when started from `cwd`. */
async function checkStaticFiles(
  bin: string,
  kv: string,
  cwd: string,
  timeoutMs: number,
): Promise<void> {
  const port = freePort();
  const child = new Deno.Command(bin, {
    args: ["--no-stdio"],
    cwd,
    env: { MCP_KV_PATH: kv, MCP_PORT: String(port) },
    stdin: "null",
    stdout: "null",
    stderr: "inherit",
  }).spawn();
  const deadline = Date.now() + timeoutMs;
  let failure = "no answer";
  try {
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://localhost:${port}/llms.txt`, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const body = await response.text();
        if (response.ok && body.length > 0) return;
        failure = `HTTP ${response.status}`;
      } catch (error) {
        failure = String(error);
      }
      await new Promise((done) => setTimeout(done, POLL_MS));
    }
    throw new Error(`/llms.txt failed: ${failure}. Is ./static in \`deno compile --include\`?`);
  } finally {
    await stop(child);
  }
}

export interface SmokeOptions {
  /** Where the temp KV files and working folder go (default: the system's). */
  tempDir?: string;
  /** How long each check may take. */
  timeoutMs?: number;
}

/**
 * Throws unless the binary passes both checks, leaving no temp files behind.
 * @returns The protocol versions the binary supports
 */
export async function smokeBinary(
  binary: string,
  { tempDir, timeoutMs = TIMEOUT_MS }: SmokeOptions = {},
): Promise<string[]> {
  const bin = resolve(binary);
  const dir = await Deno.makeTempDir({ dir: tempDir, prefix: "smoke-binary-" });
  try {
    const line = await readDiscoverReply(bin, `${dir}/stdio.kv`, timeoutMs);
    if (!line) throw new Error("no response from binary");
    const supported = JSON.parse(line)?.result?.supportedVersions;
    if (!Array.isArray(supported) || !supported.includes(MCP_PROTOCOL_VERSION)) {
      throw new Error(`supportedVersions lacks ${MCP_PROTOCOL_VERSION}: ${line}`);
    }
    await checkStaticFiles(bin, `${dir}/http.kv`, dir, timeoutMs);
    return supported;
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}

if (import.meta.main) {
  const bin = Deno.args[0];
  if (!bin) throw new Error("usage: smoke-binary.ts <binary>");
  console.log(`OK ${bin}: supportedVersions=${JSON.stringify(await smokeBinary(bin))}`);
}
