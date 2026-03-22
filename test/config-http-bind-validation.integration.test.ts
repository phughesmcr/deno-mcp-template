import { validateHttpConfig } from "$/shared/validation/config.ts";
import { assertEquals, baseCliOptions as baseCli } from "./helpers.ts";

Deno.test({
  name: "validateHttpConfig rejects 0.0.0.0 without DNS rebinding and allowed hosts",
  fn: () => {
    const result = validateHttpConfig(
      baseCli({ hostname: "0.0.0.0" }),
    );
    if (result.success) throw new Error("expected validation to fail");
    if (!result.error.message.includes("all interfaces")) {
      throw new Error(`unexpected error: ${result.error.message}`);
    }
  },
});

Deno.test({
  name: "validateHttpConfig rejects :: without DNS rebinding and allowed hosts",
  fn: () => {
    const result = validateHttpConfig(
      baseCli({ hostname: "::" }),
    );
    if (result.success) throw new Error("expected validation to fail");
  },
});

Deno.test({
  name: "validateHttpConfig allows 0.0.0.0 with dnsRebinding and non-empty allowedHosts",
  fn: () => {
    const result = validateHttpConfig(
      baseCli({
        hostname: "0.0.0.0",
        dnsRebinding: true,
        allowedHosts: ["example.com"],
        allowedOrigins: ["https://example.com"],
      }),
    );
    if (!result.success) throw new Error(result.error.message);
    assertEquals(result.value.hostname, "0.0.0.0");
    assertEquals(result.value.enableDnsRebinding, true);
  },
});

Deno.test({
  name: "validateHttpConfig allows all-interfaces bind when HTTP disabled",
  fn: () => {
    const result = validateHttpConfig(
      baseCli({ http: false, hostname: "0.0.0.0" }),
    );
    if (!result.success) throw new Error(result.error.message);
  },
});

