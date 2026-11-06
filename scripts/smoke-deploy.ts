#!/usr/bin/env -S deno run -A

/**
 * @description Checks a deployed server answers MCP, since a deployment that boots can still refuse every request
 * @usage       MCP_HTTP_BEARER_TOKEN=<token> deno run -A scripts/smoke-deploy.ts <url>
 * @license     MIT
 * @module
 */

const VERSION = "2026-07-28";
const ATTEMPTS = 5;
const RETRY_DELAY_MS = 3_000;

function discover(baseUrl: string, token: string | undefined, fetchFn: typeof fetch) {
  return fetchFn(new URL("/mcp", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      "mcp-protocol-version": VERSION,
      "mcp-method": "server/discover",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "server/discover",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
}

/**
 * Throws unless the server answers. Without a token, a 401 passes: it proves the request got past
 * the Host check to a running server.
 * @returns What was proved
 */
export async function checkDeployment(
  baseUrl: string,
  token?: string,
  { fetchFn = fetch, retryDelayMs = RETRY_DELAY_MS } = {},
): Promise<string> {
  let failure = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    let response: Response;
    try {
      response = await discover(baseUrl, token, fetchFn);
    } catch (error) {
      failure = String(error);
      continue;
    }
    const body = await response.text();
    if (response.status >= 500) {
      failure = `HTTP ${response.status}: ${body.slice(0, 200)}`;
      continue;
    }
    if (response.status === 403) {
      throw new Error(
        `HTTP 403: ${
          body.slice(0, 200)
        }\nAdd this hostname to MCP_ALLOWED_HOSTS, with MCP_DNS_REBINDING=true.`,
      );
    }
    if (response.status === 401 && !token) {
      return "server is up and requires a token (set MCP_HTTP_BEARER_TOKEN for a full check)";
    }
    if (response.ok && body.includes(`"supportedVersions"`) && body.includes(VERSION)) {
      return `server answered server/discover on ${VERSION}`;
    }
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  throw new Error(`No answer after ${ATTEMPTS} attempts: ${failure}`);
}

if (import.meta.main) {
  const url = Deno.args[0];
  if (!url) throw new Error("usage: smoke-deploy.ts <url>");
  const token = Deno.env.get("MCP_HTTP_BEARER_TOKEN") || undefined;
  console.log(`OK ${url}: ${await checkDeployment(url, token)}`);
}
