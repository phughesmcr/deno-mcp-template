import type { AppConfig } from "$/shared/types.ts";

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
 */
export async function verifyRuntimePermissions(config: AppConfig): Promise<void> {
  const requirements: RequiredPermission[] = [
    {
      descriptor: { name: "env" },
      reason: "Read MCP_* environment variables and dotenv-loaded configuration.",
      required: true,
      grantFlag: "--allow-env",
    },
    {
      descriptor: { name: "read" },
      reason: "Read static assets, project files, and optional .env/KV path files.",
      required: true,
      grantFlag: "--allow-read",
    },
    {
      descriptor: { name: "write" },
      reason: "Persist Deno KV data for resumable sessions and task/resource state.",
      required: true,
      grantFlag: "--allow-write",
    },
    {
      descriptor: { name: "net" },
      reason: "Serve HTTP transport and support networked tools.",
      required: config.http.enabled,
      grantFlag: "--allow-net",
    },
    {
      descriptor: { name: "sys" },
      reason: "Install signal handlers for graceful shutdown (SIGINT/SIGTERM/SIGHUP).",
      required: true,
      grantFlag: "--allow-sys",
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
