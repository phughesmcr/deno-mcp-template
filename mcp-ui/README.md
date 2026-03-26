# MCP UI bundle (`fetch-website-info`)

Builds a single-file HTML app into `../static/mcp-apps/fetch-website-info.html`.

From the repo root:

```bash
deno task build:mcp-ui
```

Requires Node.js and npm. Edit `src/mcp-app.ts` and run the task again before
shipping or running `deno task ci`.
