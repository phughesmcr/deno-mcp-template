import { assertEquals } from "./helpers.ts";

Deno.test("deno.json, mcpb-manifest.json and openapi.yaml agree on the version", async () => {
  const { version } = JSON.parse(await Deno.readTextFile("deno.json"));
  const manifest = JSON.parse(await Deno.readTextFile("static/mcpb-manifest.json"));
  const openapi = await Deno.readTextFile("static/.well-known/openapi.yaml");
  assertEquals(manifest.version, version);
  assertEquals(openapi.match(/^ {2}version: (\S+)$/m)?.[1], version);
});
