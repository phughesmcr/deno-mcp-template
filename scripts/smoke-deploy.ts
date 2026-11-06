#!/usr/bin/env -S deno run --allow-net --allow-env=MCP_HTTP_BEARER_TOKEN

/**
 * @description Checks a deployed server answers MCP, since a deployment that boots can still refuse every request
 * @usage       MCP_HTTP_BEARER_TOKEN=<token> deno run --allow-net --allow-env=MCP_HTTP_BEARER_TOKEN scripts/smoke-deploy.ts <url>
 * @license     MIT
 * @module
 */

import { discoverRequest, MCP_PROTOCOL_VERSION } from "./discover.ts";

const ATTEMPTS = 5;
const RETRY_DELAY_MS = 3_000;
const REQUEST_TIMEOUT_MS = 15_000;

function discover(
  baseUrl: string,
  token: string | undefined,
  fetchFn: typeof fetch,
  signal: AbortSignal,
) {
  return fetchFn(new URL("/mcp", baseUrl), {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      "mcp-method": "server/discover",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: discoverRequest(),
  });
}

/**
 * Throws unless the server answers. Without a token, a 401 passes: it proves the request got past
 * the Host check to a running server. Nothing it returns or throws names the host, which holds the
 * org slug, as CI logs may be public.
 * @returns What was proved
 */
export async function checkDeployment(
  baseUrl: string,
  token?: string,
  { fetchFn = fetch, retryDelayMs = RETRY_DELAY_MS, timeoutMs = REQUEST_TIMEOUT_MS } = {},
): Promise<string> {
  const { hostname } = new URL(baseUrl);
  const clean = (text: string) => text.replaceAll(hostname, "<host>");
  let failure = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    let response: Response;
    let body: string;
    try {
      // One signal for both: a `text/event-stream` body can stay open after the headers arrive.
      response = await discover(baseUrl, token, fetchFn, AbortSignal.timeout(timeoutMs));
      body = await response.text();
    } catch (error) {
      failure = clean(String(error));
      continue;
    }
    const excerpt = clean(body).slice(0, 200);
    if (response.status >= 500) {
      failure = `HTTP ${response.status}: ${excerpt}`;
      continue;
    }
    if (response.status === 403) {
      throw new Error(
        `HTTP 403: ${excerpt}\nAdd this hostname to MCP_ALLOWED_HOSTS, with MCP_DNS_REBINDING=true.`,
      );
    }
    if (response.status === 401 && !token) {
      return "server is up and requires a token (set MCP_HTTP_BEARER_TOKEN for a full check)";
    }
    if (
      response.ok && body.includes(`"supportedVersions"`) && body.includes(MCP_PROTOCOL_VERSION)
    ) {
      return `server answered server/discover on ${MCP_PROTOCOL_VERSION}`;
    }
    throw new Error(`HTTP ${response.status}: ${excerpt}`);
  }
  throw new Error(`No answer after ${ATTEMPTS} attempts: ${failure}`);
}

if (import.meta.main) {
  const url = Deno.args[0];
  if (!url) throw new Error("usage: smoke-deploy.ts <url>");
  const token = Deno.env.get("MCP_HTTP_BEARER_TOKEN") || undefined;
  console.log(`OK: ${await checkDeployment(url, token)}`);
}
