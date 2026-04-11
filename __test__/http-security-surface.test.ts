import {
  describeHttpSecuritySurface,
  httpSecurityPolicyFromHttpConfig,
  resolveHostHeaderProtection,
} from "$/shared/httpSecurityPolicy.ts";
import { baseHttpConfig } from "./helpers.ts";

Deno.test("httpSecurityPolicyFromHttpConfig + surface: localhost bind", () => {
  const http = baseHttpConfig({ hostname: "localhost" });
  const policy = httpSecurityPolicyFromHttpConfig(http);
  if (policy.host.kind !== "localhost") throw new Error(policy.host.kind);
  const surface = describeHttpSecuritySurface(policy);
  if (surface.layers.length < 2) throw new Error("expected layers");
  const hostLayer = surface.layers.find((l) => l.id === "host-header");
  if (hostLayer?.status !== "active") throw new Error("expected active host layer");
});

Deno.test("resolveHostHeaderProtection explicit when DNS rebinding + hosts", () => {
  const mode = resolveHostHeaderProtection(
    baseHttpConfig({
      enableDnsRebinding: true,
      allowedHosts: ["example.com"],
      allowedOrigins: ["https://example.com"],
    }),
  );
  if (mode.kind !== "explicit") throw new Error(mode.kind);
});
