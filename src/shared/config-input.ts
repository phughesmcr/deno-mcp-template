/**
 * Neutral configuration input for validation (no CLI / Cliffy types).
 * @module
 */

/** Input shape for {@link validateConfig} — produced by the app layer from argv/env. */
export type McpConfigInput = {
  http: boolean;
  stdio: boolean;
  hostname: string;
  port: number;
  headers: string[];
  allowedOrigins: string[];
  allowedHosts: string[];
  dnsRebinding: boolean;
  jsonResponse: boolean;
  trustProxy: boolean;
  requireHttpAuth: boolean;
  maxTaskTtlMs: number;
  tlsCert?: string;
  tlsKey?: string;
  kvPath?: string;
  httpBearerToken?: string;
  publicBaseUrl?: string;
};

export type FileStatError = "not_found" | "permission_denied" | "not_file" | "unknown";

export interface FileStatPort {
  statFile(
    path: string,
  ): { kind: "file" } | { kind: "error"; code: FileStatError; message?: string };
}

export type ValidateConfigDeps = Readonly<{ files: FileStatPort }>;
