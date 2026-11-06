/// <reference lib="deno.ns" />

const read = (path: string): Promise<string> =>
  Deno.readTextFile(new URL(path, import.meta.url));

Deno.test("the page has every element mcp-app.ts requires", async () => {
  const script = await read("./mcp-app.ts");
  const page = await read("../fetch-website-info.html");

  const ids = [...script.matchAll(/requireElement\(\s*"#([\w-]+)/g)]
    .map((match) => match[1]);
  const missing = ids.filter((id) => !page.includes(`id="${id}"`));

  if (ids.length === 0) throw new Error("found no requireElement calls");
  if (missing.length) throw new Error(`missing ids: ${missing.join(", ")}`);
});
