import { validateHttpConfig } from "$/shared/validation/config.ts";
import { baseMcpConfigInput as baseCli, defaultValidateConfigDeps } from "./helpers.ts";

Deno.test("validateHttpConfig rejects publicBaseUrl when HTTP disabled", () => {
  const result = validateHttpConfig(
    baseCli({ http: false, publicBaseUrl: "https://example.com" }),
    defaultValidateConfigDeps,
  );
  if (result.success) throw new Error("expected validation to fail");
  if (!result.error.message.includes("HTTP")) {
    throw new Error(`unexpected error: ${result.error.message}`);
  }
});

Deno.test("validateHttpConfig accepts publicBaseUrl when HTTP enabled", () => {
  const result = validateHttpConfig(
    baseCli({ publicBaseUrl: "https://example.com" }),
    defaultValidateConfigDeps,
  );
  if (!result.success) throw new Error(result.error.message);
  if (result.value.publicBaseUrl !== "https://example.com") {
    throw new Error(`unexpected publicBaseUrl: ${result.value.publicBaseUrl}`);
  }
});
