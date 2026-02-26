# Deno MCP Server Template

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/ci.yml?label=CI)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/release.yml?label=release)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/deploy.yml?label=deploy)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/phughesmcr/deno-mcp-template/publish.yml?label=publish)

![Typescript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![Version](https://img.shields.io/github/package-json/v/phughesmcr/deno-mcp-template?filename=deno.json)
![Repo Size](https://img.shields.io/github/languages/code-size/phughesmcr/deno-mcp-template)
![License](https://img.shields.io/github/license/phughesmcr/deno-mcp-template)

![Sponsor](https://img.shields.io/github/sponsors/phughesmcr)

<div align="center">
    <img src="static/banner_480.png" alt="Repo Logo - a happy dinosaur with a happy robot on its back walks in-front of a cliff-face with the letters M C P carved into it" width="320" />
</div>

**The batteries-included starting point for building production MCP servers in TypeScript.**

Clone, run setup, start building. Ships with STDIO + HTTP transports, security middleware, persistent state, sandboxed execution, CI/CD workflows, and every distribution format you need -- JSR package, native binary, DXT extension, or hosted on Deno Deploy.

## Why This Template?

**You get a working MCP server in under 2 minutes.** Not a toy -- a real server with rate limiting, CORS, session management, TLS support, and structured logging already wired up.

**Deno gives you superpowers that other runtimes don't.** Built-in KV database (no Postgres/Redis to set up), native cron scheduling, sandboxed code execution in microVMs, compile-to-binary, and first-class Deploy hosting. This template puts all of them to work.

**Ship anywhere, any way.** One codebase produces:
- a local STDIO server for Cursor, Claude Desktop, or any MCP client
- a remote HTTP server with Streamable HTTP transport
- a JSR package anyone can `deno run` without cloning
- a standalone native binary (no runtime needed)
- a DXT extension for one-click Claude Desktop install
- a Deno Deploy app for managed cloud hosting

**AI-agent friendly codebase.** Small files (<200 LOC), feature-grouped structure, explicit types. Your coding agent can navigate and extend it without context overload.

## Quick Start

```bash
# Install Deno (if needed)
curl -fsSL https://deno.land/install.sh | sh

# Create your project from template
gh repo create my-mcp-server --template phughesmcr/deno-mcp-template
cd my-mcp-server

# One-time setup -- renames placeholders, then self-destructs
deno task setup

# Start the server (STDIO + HTTP on localhost:3001)
deno task start

# Or launch with MCP Inspector for interactive testing
deno task dev
```

Connect from any MCP client:

```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "deno",
      "args": ["run", "-A", "/absolute/path/to/main.ts"]
    }
  }
}
```

That's it. You have a running MCP server with tools, resources, prompts, and task workflows.

## What's Included

### Out-of-the-box infrastructure

| What | How | Where |
| --- | --- | --- |
| Dual transports | STDIO + Streamable HTTP from a single app | `src/app/` |
| HTTP middleware | Rate limiting, CORS, security headers, timeouts, sessions | `src/app/http/hono.ts` |
| Persistent state | Deno KV -- zero-config locally, built-in on Deploy | `src/app/kv/` |
| Session resumability | KV-backed event store for stream recovery | `src/app/http/kvEventStore.ts` |
| Background tasks | Durable async task queue with KV state | `src/mcp/tasks/` |
| Scheduled jobs | `Deno.cron` for periodic maintenance | `src/app/cron.ts` |
| Sandboxed execution | `@deno/sandbox` microVMs for untrusted code | `src/mcp/tools/sandbox.ts` |
| CI/CD workflows | GitHub Actions for CI, release, deploy, JSR publish | `.github/workflows/` |
| Config management | CLI flags + env vars with validation and merging | `src/app/cli.ts` |
| Permission preflight | Fail-fast startup checks with actionable guidance | `src/app/permissions.ts` |

### Example MCP features (replace with your own)

**Prompts:** `review-code`, `language-snippet`

**Resources:** `hello://world`, `greetings://{name}`, `counter://value` (KV-backed, subscribable)

**Tools:** `elicit-input`, `fetch-website-info`, `increment-counter`, `log-message`, `notify-list-changed`, `poem` (sampling), `execute-code` (sandboxed)

**Task workflows (experimental):** `delayed-echo`, `guided-poem` (elicitation + sampling pipeline)

These cover prompts with arguments, static and dynamic resources, subscriptions, sampling, elicitation, notifications, list-changed events, KV persistence, sandboxed execution, and async task patterns. Use them as reference, then swap in your domain logic.

## Make It Yours

Run `deno task setup` first -- it rewrites package names, scopes, and metadata across the project in one pass.

### Where to start editing

1. **`src/shared/constants/`** -- server name, description, version, defaults
2. **`src/mcp/tools/`** -- add your tools (follow existing patterns)
3. **`src/mcp/resources/`** -- add your resources
4. **`src/mcp/prompts/`** -- add your prompts
5. **`src/mcp/mod.ts`** -- wire new features into the server
6. **`src/app/http/hono.ts`** -- adjust CORS, middleware, routes

### What to remove

Delete the example files you don't need from `src/mcp/tools/`, `src/mcp/resources/`, and `src/mcp/prompts/`. Update the corresponding `mod.ts` barrel exports. Done.

## Ship It

### Choose your distribution

| Goal | Command | Output |
| --- | --- | --- |
| Run locally via STDIO | `deno task start` | Direct process |
| Serve over HTTP | `deno task start` | `localhost:3001/mcp` |
| Publish as JSR package | `deno publish` | `jsr:@scope/package` |
| Compile native binary | `deno task compile:all` | `dist/server/` |
| Package as DXT | `deno task dxt:all` | `dist/server.dxt` |
| Deploy to cloud | `deno deploy --prod` | Deno Deploy URL |

Platform-specific compile/DXT tasks are also available: `compile:win`, `compile:mac:arm64`, `compile:mac:x64`, `compile:linux:x64`, `compile:linux:arm64` (and matching `dxt:*` variants).

Compile tasks bundle the `static/` directory, so binaries serve static routes without depending on the working directory.

**DXT prerequisite:** install the DXT CLI once with `npm install -g @anthropic-ai/dxt`. Update `static/dxt-manifest.json` before packaging.

**JSR prerequisite:** you need a [JSR.io](https://jsr.io) account. If you don't plan to publish on JSR, remove `.github/workflows/publish.yml`.

### Client configuration examples

**STDIO** (Cursor, Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "deno",
      "args": ["run", "-A", "/absolute/path/to/main.ts"]
    }
  }
}
```

**HTTP with mcp-remote:**

```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:3001/mcp"]
    }
  }
}
```

**HTTP direct (clients with URL support):**

```json
{
  "mcpServers": {
    "my-mcp-server": {
      "url": "http://localhost:3001/mcp",
      "headers": { "origin": "http://localhost:3001" }
    }
  }
}
```

**JSR package:**

```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "deno",
      "args": ["run", "-A", "jsr:@your-scope/your-package"]
    }
  }
}
```

**Compiled binary:**

```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "/absolute/path/to/binary"
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add my-mcp-server /absolute/path/to/binary
claude mcp add --transport http my-mcp-server http://localhost:3001/mcp
```

### Deploy to Deno Deploy (optional)

```bash
# Create app (one-time)
deno deploy create \
  --org <YOUR_ORG> \
  --app <YOUR_APP> \
  --source local \
  --runtime-mode dynamic \
  --entrypoint main.ts \
  --build-timeout 5 \
  --build-memory-limit 1024 \
  --region us

# Deploy
deno deploy --prod
```

Set `DENO_DEPLOY_TOKEN`, `DENO_DEPLOY_ORG`, and `DENO_DEPLOY_APP` in GitHub Actions secrets for automatic deploys. Remove `.github/workflows/deploy.yml` if not using Deploy.

## Production Checklist

- [ ] Run `deno task setup` and verify all placeholder names are replaced
- [ ] Remove or replace demo tools/resources/prompts you won't ship
- [ ] Update `static/.well-known/openapi.yaml` and `static/dxt-manifest.json`
- [ ] Configure `MCP_ALLOWED_ORIGINS` and `MCP_ALLOWED_HOSTS` for your environments
- [ ] Replace `src/app/http/kvEventStore.ts` with a production-grade event store (the included one is a demo)
- [ ] Switch from `deno run -A` to [explicit permissions](https://docs.deno.com/runtime/fundamentals/security/) for production
- [ ] Review `--allow-net` scope for any outbound tool calls
- [ ] Set environment variables in CI and hosting provider
- [ ] Run `deno task ci` (format, lint, type-check, test)

## Configuration

| Variable | Flag | Default | Description |
| --- | --- | --- | --- |
| `MCP_NO_HTTP` | `--no-http` | `false` | Disable HTTP server |
| `MCP_NO_STDIO` | `--no-stdio` | `false` | Disable STDIO transport |
| `MCP_HOSTNAME` | `-n` | `localhost` | HTTP listen hostname |
| `MCP_PORT` | `-p` | `3001` | HTTP listen port |
| `MCP_TLS_CERT` | `--tls-cert` | | PEM certificate path (requires `--tls-key`) |
| `MCP_TLS_KEY` | `--tls-key` | | PEM private key path (requires `--tls-cert`) |
| `MCP_HEADERS` | `-H` | | Response headers (collection) |
| `MCP_JSON_RESPONSE` | `--json-response` | `false` | JSON-only responses (disable SSE) |
| `MCP_DNS_REBINDING` | `--dnsRebinding` | `false` | Enable DNS rebinding protection |
| `MCP_ALLOWED_ORIGINS` | `--origin` | | Allowed CORS origins (collection) |
| `MCP_ALLOWED_HOSTS` | `--host` | | Allowed hostnames (collection) |
| `MCP_KV_PATH` | `--kv-path` | | Custom Deno KV database path |
| `DENO_DEPLOY_TOKEN` | | | Deploy token (required by `execute-code` sandbox tool) |

CLI flags override env vars. Collection values (`-H`, `--origin`, `--host`) are merged from both sources.

### Collection config examples

Collection-style values can be set as comma-separated strings in `.env`:

```env
MCP_HEADERS=x-api-key:demo,cache-control:no-store
MCP_ALLOWED_ORIGINS=http://localhost:6274,https://app.example.com
MCP_ALLOWED_HOSTS=localhost,127.0.0.1,app.example.com
```

Or repeated CLI flags:

```bash
deno task start -- \
  -H "x-api-key:demo" \
  -H "cache-control:no-store" \
  --origin "http://localhost:6274" \
  --origin "https://app.example.com" \
  --host "localhost" \
  --host "app.example.com"
```

Use `--origin` for full origins (e.g. `https://example.com`) and `--host` for hostnames or IPs (e.g. `example.com`, `127.0.0.1`).

## Development

| Command | What it does |
| --- | --- |
| `deno task start` | Start server |
| `deno task dev` | Start with MCP Inspector + watch mode |
| `deno task ci` | Format, lint, type-check, and test |
| `deno task test:integration` | Run integration tests |
| `deno task test:coverage` | Tests with coverage report |
| `deno task bench` | Run benchmarks |

### Runtime permissions

The app validates required permissions at startup and fails fast with actionable guidance. For production, prefer explicit permissions over `-A`:

```bash
# HTTP + STDIO (local defaults)
deno run --env-file=.env \
  --allow-env --allow-read --allow-write --allow-sys \
  --allow-net=localhost:3001 \
  main.ts

# STDIO only (no HTTP listener)
deno run --env-file=.env \
  --allow-env --allow-read --allow-write --allow-sys \
  main.ts --no-http
```

If you keep networked tools (such as `fetch-website-info`), include their destinations in `--allow-net`.

### Lockfile and reproducibility

This template tracks `deno.lock` for deterministic dependency resolution.

- Refresh lock data: `deno install --entrypoint main.ts --frozen=false`
- Verify locked resolution (CI): `deno install --frozen --entrypoint main.ts`
- Commit `deno.lock` with dependency changes.

## Project Structure

```text
main.ts                     # Entry point
src/
  app/                      # Runtime shell: transports, HTTP, KV, cron, signals
  mcp/                      # MCP server: tools, resources, prompts, tasks
  shared/                   # Constants, types, validation, utilities
static/                     # Static files, OpenAPI spec, DXT manifest
scripts/                    # Setup, build, and packaging helpers
test/                       # Integration tests and benchmarks
.github/workflows/          # CI, release, deploy, publish
```

For the full annotated tree, transport internals, feature reference, and development caveats, see
[`docs/architecture.md`](docs/architecture.md).

## Extras

Included quality-of-life files:

- `.cursor/rules/` -- Cursor agent rules for this project
- `.cursorignore` -- tells Cursor to exclude files in addition to `.gitignore`
- `.vscode/` -- recommended extensions, Deno as default formatter
- `.github/` -- CI/CD workflows, sponsors config, issue templates
- `CLAUDE.md` -- optional Claude Code project context
- `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, etc. -- community management files for GitHub

## References

- [MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18)
- [MCP Concepts](https://modelcontextprotocol.io/docs/concepts/)
- [Deno Docs](https://docs.deno.com/)
- [Deno Deploy](https://docs.deno.com/deploy/)
- [Deno Sandbox](https://docs.deno.com/sandbox/)
- [Hono](https://hono.dev/docs/)

## Acknowledgements

If you use this template, please consider contributing fixes and features, starring the repo, and sponsoring.

This is not an official Deno project.

## License

MIT -- this is a template, not a library. You're expected to modify it before shipping to production.
