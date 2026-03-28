# MCP UI bundle (`fetch-website-info`)

Builds a single-file HTML app into `../static/mcp-apps/fetch-website-info.html`.

From the repo root:

```bash
deno task build:mcp-ui
```

This runs Deno tasks in this directory: `deno install` (with `mcp-ui/deno.lock`
and `--frozen`) plus `deno run -A npm:vite build`. No Node.js or `npm` CLI is
required. After changing dependencies in `deno.json` (`imports`), run
`deno install --allow-scripts=npm:esbuild` from `mcp-ui/` (without `--frozen`
once) to refresh `deno.lock`, then commit the lockfile.

Edit `src/mcp-app.ts` and run `deno task build:mcp-ui` again before shipping or
running `deno task ci`.
