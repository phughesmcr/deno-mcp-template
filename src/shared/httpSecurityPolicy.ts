/**
 * HTTP listen safety policy derived from validated {@link AppConfig} HTTP slice (no Hono).
 * @module
 */

import type { AppConfig } from "$/shared/config-types.ts";
import { DEFAULT_ALLOWED_ORIGINS, isAllInterfacesBindHostname } from "$/shared/constants.ts";

const LOOPBACK_BIND_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export type HostHeaderProtectionMode =
  | { kind: "localhost" }
  | { kind: "explicit"; allowedHostnames: string[] }
  | { kind: "none" };

/**
 * Resolves which Host-header protection applies (aligned with MCP streamable HTTP guidance).
 */
export function resolveHostHeaderProtection(
  http: AppConfig["http"],
): HostHeaderProtectionMode {
  const { hostname, enableDnsRebinding, allowedHosts = [] } = http;
  if (enableDnsRebinding && allowedHosts.length > 0) {
    return { kind: "explicit", allowedHostnames: [...allowedHosts] };
  }
  if (LOOPBACK_BIND_HOSTNAMES.has(hostname.trim().toLowerCase())) {
    return { kind: "localhost" };
  }
  return { kind: "none" };
}

export type HttpSecurityPolicy = {
  version: 1;
  host: HostHeaderProtectionMode;
  corsAllowedOrigins: string[];
  trustProxy: boolean;
};

export function httpSecurityPolicyFromHttpConfig(http: AppConfig["http"]): HttpSecurityPolicy {
  return {
    version: 1,
    host: resolveHostHeaderProtection(http),
    corsAllowedOrigins: http.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
    trustProxy: !!http.trustProxy,
  };
}

export type HttpSecurityLayer = {
  id: string;
  title: string;
  status: "active" | "inactive";
  rationale: string;
  implements: readonly { file: string; symbol?: string }[];
};

export type HttpSecuritySurface = {
  version: 1;
  layers: HttpSecurityLayer[];
  warnings: string[];
};

/** Operator- and test-facing checklist of effective HTTP security layers. */
export function describeHttpSecuritySurface(policy: HttpSecurityPolicy): HttpSecuritySurface {
  const layers: HttpSecurityLayer[] = [
    {
      id: "host-header",
      title: "Host header validation",
      status: policy.host.kind === "none" ? "inactive" : "active",
      rationale: policy.host.kind === "explicit" ?
        "DNS rebinding protection with explicit hostname allowlist." :
        policy.host.kind === "localhost" ?
        "Loopback bind: Host must be localhost / 127.0.0.1 / ::1." :
        "No Host middleware (non-loopback bind without DNS rebinding host list).",
      implements: [
        {
          file: "src/app/http/hostHeaderMiddleware.ts",
          symbol: "createLocalhostHostValidationMiddleware",
        },
        { file: "src/shared/httpSecurityPolicy.ts", symbol: "resolveHostHeaderProtection" },
      ],
    },
    {
      id: "cors",
      title: "CORS allowlist",
      status: policy.corsAllowedOrigins.length > 0 ? "active" : "inactive",
      rationale: policy.corsAllowedOrigins.length > 0 ?
        "Browser Origin must match configured allowed origins." :
        "Empty default allowlist: browser cross-origin requests rejected unless origins are configured.",
      implements: [
        { file: "src/app/http/httpSecurityMiddleware.ts", symbol: "applyHttpCorsMiddleware" },
      ],
    },
  ];

  const warnings: string[] = [];
  if (policy.host.kind === "none") {
    warnings.push(
      "Host validation middleware is off; ensure bind address and deployment trust model are intentional.",
    );
  }

  return { version: 1, layers, warnings };
}

export function shouldWarnAllInterfacesBindWithoutHostAllowlist(
  http: AppConfig["http"],
): boolean {
  if (http.enableDnsRebinding && (http.allowedHosts?.length ?? 0) > 0) {
    return false;
  }
  return isAllInterfacesBindHostname(http.hostname);
}

export function isLoopbackBindHostname(hostname: string): boolean {
  return LOOPBACK_BIND_HOSTNAMES.has(hostname.trim().toLowerCase());
}

export function shouldWarnUnauthenticatedHttp(http: AppConfig["http"]): boolean {
  if (!http.enabled) return false;
  if (http.httpBearerToken?.trim()) return false;
  return !isLoopbackBindHostname(http.hostname);
}
