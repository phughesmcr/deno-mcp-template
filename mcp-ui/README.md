# MCP UI bundle (`fetch-website-info`)

Builds a single-file HTML app into `../static/mcp-apps/fetch-website-info.html`.

From the repo root:

```bash
deno task build:mcp-ui
```

This runs Deno tasks in this directory: `deno install` (with `mcp-ui/deno.lock`
and `--frozen`), the `check` task (format, lint, type-check, test), then
`deno run -A npm:vite build`. `deno task ci` runs all of it. No Node.js or `npm`
CLI is required. After changing dependencies in `deno.json` (`imports`), run
`deno install --allow-scripts=npm:esbuild` from `mcp-ui/` (without `--frozen`
once) to refresh `deno.lock`, then commit the lockfile.

Edit the page or `src/`, then run `deno task build:mcp-ui` again before shipping
or running `deno task ci`. The built file is checked in, and
`__test__/mcp-fetch-website-info-app.integration.test.ts` fails if it is missing
an element of the page or loads anything from outside.

## Layout

- `fetch-website-info.html`: the page. Buttons start disabled and are enabled
  once the host connects.
- `src/mcp-app.ts`: wires the page to the host. It runs on load, so tests leave
  it out.
- `src/elements.ts`: finds the page's elements, and fails at startup if one is
  missing.
- `src/toolResult.ts`: validates a tool result with zod. Its schema mirrors the
  tool's output schema; the integration test runs real results through it.
- `src/view.ts`: rendering and host context (theme, fonts, dimensions).
- `src/resourcesPanel.ts`: the server resources panel.
- `src/mcp-app.css`: styles use only the style variables in the MCP Apps spec
  (`McpUiStyleVariableKey` in ext-apps). `:root` sets a light and a dark default
  for each one, and the host overrides them. A test fails on any other name.

Tests run in Deno against the real page, using linkedom for the DOM. They do not
cover layout or colour, so check those in a browser.
