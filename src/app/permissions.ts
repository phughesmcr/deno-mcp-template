import {
  deriveMcpRuntimeRequirements,
  type McpServerDefinition,
  mcpServerDefinition,
} from "$/mcp/serverDefinition.ts";
import type { AppConfig } from "$/shared/config-types.ts";
import { STATIC_ROOT } from "./http/hono.ts";

type RequiredPermission = {
  descriptor: Deno.PermissionDescriptor;
  reason: string;
  required: boolean;
  grantFlag: string;
};

async function getMissingPermissions(
  requirements: RequiredPermission[],
): Promise<RequiredPermission[]> {
  const missing: RequiredPermission[] = [];
  for (const requirement of requirements) {
    if (!requirement.required) continue;
    const result = await Deno.permissions.query(requirement.descriptor);
    if (result.state !== "granted") {
      missing.push(requirement);
    }
  }
  return missing;
}

/**
 * Verifies runtime permissions required by the configured app features.
 * Throws a descriptive error when one or more permissions are missing.
 * @param config - The app configuration
 * @param def - Feature registry override (for tests or profiles).
 */
export async function verifyRuntimePermissions(
  config: AppConfig,
  def: McpServerDefinition = mcpServerDefinition,
): Promise<void> {
  const { hostname, port, tlsCert, tlsKey } = config.http;
  const kvPath = config.kv.path;
  const readPaths = [STATIC_ROOT, kvPath, tlsCert, tlsKey].filter((path) => path !== undefined);
  const toolsNeedNet = deriveMcpRuntimeRequirements(def).net;

  const requirements: RequiredPermission[] = [
    {
      descriptor: { name: "env" },
      reason: "Read MCP_* environment variables and dotenv-loaded configuration.",
      required: true,
      grantFlag: "--allow-env",
    },
    ...readPaths.map((path): RequiredPermission => ({
      descriptor: { name: "read", path },
      reason: "Read static assets, and the KV and TLS files when configured.",
      required: true,
      grantFlag: `--allow-read=${path}`,
    })),
    {
      // The default KV location needs no permission, so this applies only to a configured path.
      descriptor: { name: "write", path: kvPath ?? "" },
      reason: "Persist Deno KV data for resources and pending URL elicitations.",
      required: kvPath !== undefined,
      grantFlag: `--allow-write=${kvPath}`,
    },
    {
      descriptor: { name: "net", host: `${hostname}:${port}` },
      reason: "Serve the HTTP transport.",
      required: config.http.enabled && !toolsNeedNet,
      grantFlag: `--allow-net=${hostname}:${port}`,
    },
    {
      // Tools choose their destinations at run time, so a host list cannot be checked here.
      descriptor: { name: "net" },
      reason: "Run MCP tools that use the network, and serve HTTP when enabled.",
      required: toolsNeedNet,
      grantFlag: "--allow-net",
    },
  ];

  const missing = await getMissingPermissions(requirements);
  if (!missing.length) return;

  const details = missing
    .map((permission) => `- ${permission.grantFlag}: ${permission.reason}`)
    .join("\n");

  throw new Error(
    `Missing required Deno permissions:\n${details}\n\n` +
      "Grant the listed flags explicitly when starting the server.",
  );
}
