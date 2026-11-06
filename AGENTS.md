# Deno MCP Template Development Guide

Deno version: 2.9.8 (pinned in CI)

## Build/Development Commands

Start: `deno task start`
Dev mode: `deno task dev`
Check formatting, lint, types and tests: `deno task ci` (it rebuilds `static/mcp-apps/` first, then only checks, so run `deno fmt` first)
Rebuild MCP App HTML (after editing `mcp-ui/`): `deno task build:mcp-ui` (formats, lints, type-checks and tests `mcp-ui` first; Deno installs npm deps from `mcp-ui/deno.json` `imports` into `mcp-ui/node_modules` using `mcp-ui/deno.lock`; no Node.js)
Tests with coverage: `deno task test:coverage`
Benchmarks: `deno task bench`
MCPB bundle (compile all platforms + pack to `dist/server.mcpb`): `deno task mcpb:all`; `deno task mcpb:pack` repacks existing binaries; manifest in `static/mcpb-manifest.json`
Strip the example features: `deno task strip` (`--dry-run` to preview), checked by `.github/workflows/strip.yml`. A new demo file outside `src/mcp/{tools,resources,prompts}/`, or a test that uses a demo, must be added to `DELETE` in `scripts/strip-demo.ts`
Rename the template: `deno task setup`, checked by `.github/workflows/setup.yml`. A new file with a template name must be added to `FILES_TO_UPDATE` in `scripts/setup-template.ts`

## Architecture

### `src/mcp/` vs `src/app/`

- `src/mcp/` — MCP server: prompts, resources, tools, apps, server wiring.
- `src/app/` — Host shell: transport bootstrapping, HTTP (Hono on `Deno.serve`), lifecycle, permissions preflight, KV, signals.

### Protocol and statelessness

The server speaks MCP protocol revision **2026-07-28 only** (`@modelcontextprotocol/server` 2.x) and is **stateless**: no sessions, no `initialize`, no MCP tasks. Both transports use `legacy: "reject"`, so 2025-era clients get an unsupported-version error. Every HTTP request carries `MCP-Protocol-Version` and `Mcp-Method` headers (plus `Mcp-Name` for `tools/call`, `prompts/get`, `resources/read`).

### HTTP stack

`POST /mcp` is served by `createMcpHandler` (`src/app/http/mod.ts`) mounted on Hono (`src/app/http/hono.ts`); other methods on `/mcp` get a 405 from the SDK. Middleware includes rate limiting, the `/mcp` Origin check, CORS, optional bearer auth, host validation, security headers, and request timeouts (skipped for `/mcp`, whose `subscriptions/listen` streams are long-lived). Also served: `/`, `/favicon.ico`, `/mcp-elicitation/confirm` (URL-mode elicitation pages), `/.well-known/*`, `/static/*`, `/llms.txt`, `/openapi.yaml`.

### One `McpServer` per request

Instances are short-lived. `createMcpHandler` calls the factory (`createMcpServer` in `src/mcp/mod.ts`) for each HTTP request; STDIO uses `serveStdio` (`src/app/stdio.ts`), which also builds a throwaway discovery instance.

Everything that must outlive a request lives **outside** the instances in `McpServerFactoryContext` (`src/mcp/context.ts`): the **Deno KV** runtime (`kv`), the **`ServerEventBus`** (`events`), the signed-state codec (`requestState`) and `publicBaseUrl`. Tool/prompt/resource handlers receive it as their last argument (`deps`).

### Change notifications

List-changed and resource-updated notifications are published on the shared `ServerEventBus`. Over HTTP clients receive them on `subscriptions/listen` streams; over STDIO `src/app/stdio.ts` forwards them to the connected client. KV watchers for resources in `src/mcp/resources/kvKeys.ts` are started in `src/app/app.ts` and publish `resource_updated`.

### Multi-round interaction (`input_required`)

Tools, prompts and resources cannot call `elicitInput` / `createMessage`. They return `inputRequired({ inputRequests, requestState? })`; the client fulfils the requests and retries with `ctx.mcpReq.inputResponses`. State that must survive between rounds goes in signed `requestState` (`deps.requestState.mint(...)`), keyed by env `MCP_REQUEST_STATE_KEY` (32+ bytes; random per process when unset, so set it for multi-instance deployments). See `src/mcp/tools/elicitInput.ts`, `elicitFormWizard.ts`, `poem.ts`. Sampling, roots and logging are deprecated by SEP-2577, still in the spec for at least twelve months. The demos stay, but do not build new features on them.

### Security and transport toggles

- **Host header validation** (see `src/app/http/hostHeaderMiddleware.ts`): on loopback listen addresses, `Host` must be `localhost`, `127.0.0.1`, or `[::1]` (port ignored). With `--dnsRebinding` and configured allowed hosts, that list applies instead. Binding to all interfaces (`0.0.0.0` or `::`) requires `--dnsRebinding` and at least one allowed host; otherwise startup fails.
- **DNS rebinding protection** on the HTTP transport is opt-in: `MCP_DNS_REBINDING=true` or `--dnsRebinding` (with `--origin` / `--host` per CLI rules). Use `MCP_ALLOWED_ORIGINS` and `MCP_ALLOWED_HOSTS` for Origin and Host checks.
- CORS allowed origins default to **empty**; browser clients need `MCP_ALLOWED_ORIGINS` or `--origin`. `/mcp` answers 403 to a present `Origin` not on that list, whatever `--dnsRebinding` says.
- When stdin closes, the app stops if HTTP is off; with HTTP on, only STDIO disconnects.
- HTTP: on by default; disable with `MCP_NO_HTTP=true` or `--no-http`.
- STDIO: on by default; disable with `MCP_NO_STDIO=true` or `--no-stdio`.

### Deno KV in this template

KV is built into Deno (`Deno.Kv`): file-backed locally, managed service on [Deno Deploy](https://docs.deno.com/deploy/kv/manual/). Used here for the counter resource and pending URL-mode elicitations. Open lazily via `deps.kv.get()`.

### Sandboxed `execute-code`

Runs untrusted TS/JS in [Deno Sandbox](https://docs.deno.com/sandbox/) (isolated VM, no net/fs/env). Set `DENO_DEPLOY_TOKEN` in `.env` (Deploy dashboard → Organization Tokens). Implementation: `src/mcp/tools/sandbox.ts`. A timeout or cancellation kills the code with SIGKILL, as it could trap SIGTERM.

### Caveats

- Without `MCP_REQUEST_STATE_KEY`, each process signs `requestState` with a random key; in-flight multi-round calls end at restart and do not cross instances.
- `start`, `dev`, the compile tasks and the `main.ts` shebang grant `--allow-env --allow-net --allow-read --allow-write`; `scripts/*` tasks use scoped flags, except `deploy:setup`, which keeps `-A`. `src/app/permissions.ts` accepts read and write scoped to the paths it needs, so scope them before production ([Deno security](https://docs.deno.com/runtime/fundamentals/security/)).
- `ServerEventBus` is in-memory, so list-changed events reach only streams on the same instance. `resource_updated` crosses instances through KV watches. On a multi-instance deployment such as Deno Deploy, implement `ServerEventBus` over shared pub/sub if clients rely on list-changed events.
- With `--dnsRebinding`, configure origins/hosts via env/CLI or `src/shared/constants/http.ts`.
- Before shipping, review `static/.well-known/openapi.yaml`, `static/.well-known/llms.txt`, and `static/mcpb-manifest.json`; set secrets in GitHub and Deno Deploy as needed.
- After `deno task setup`, do a final pass for template names and identifiers.

## Project Structure

The code is structured to be easily parsable by an AI agent. Files are grouped by feature, and ideally less than 200 lines of code.

```markdown
deno.json     # Project configuration
main.ts       # The main entry point
scripts/
├── clean-dist.ts                   # Cleans dist/ build output
├── conformance-baseline.yml        # Expected conformance failures
├── deploy-setup.ts                 # `deno task deploy:setup` creates a Deno Deploy app
├── discover.ts                     # The server/discover request shared by the smoke tests
├── mcpb.ts                         # Packs a compiled binary into dist/server.mcpb (`deno task mcpb:*`)
├── run-mcp-conformance.sh          # Runs the MCP conformance suite against a local server
├── setup-sep1730-labels.sh         # GitHub label setup
├── setup-template.ts               # `deno task setup` renames the template
├── smoke-binary.ts                 # Smoke test for compiled binaries
├── smoke-deploy.ts                 # Checks a deployed server answers MCP
└── strip-demo.ts                   # `deno task strip` removes the example features
mcp-ui/
├── fetch-website-info.html         # MCP App page, built into static/mcp-apps/
└── src/                            # App modules and tests, see mcp-ui/README.md
src/
├── app/
│   ├── http/
│   │   ├── honoEnv.ts              # Hono bindings/variables types
│   │   ├── hono.ts                 # Hono app: middleware, POST /mcp (SDK handler), static and browser routes
│   │   ├── hostHeaderMiddleware.ts # Host allowlist (localhost + explicit DNS rebinding hosts)
│   │   ├── httpBearerAuthMiddleware.ts # Optional bearer auth for `/mcp`
│   │   ├── httpSecurityMiddleware.ts # Origin check + CORS + host protection wiring
│   │   ├── mod.ts                  # Deno.serve + createMcpHandler (legacy: "reject")
│   │   ├── rateLimitIdentity.ts    # Rate-limit client identity (IP / unknown)
│   │   └── urlElicitationRoutes.ts # Browser pages for URL-mode elicitation
│   ├── app.ts                      # The main application class (KV, event bus, watchers, transports)
│   ├── cli.ts                      # Parses CLI args and env vars into an AppConfig object
│   ├── denoFileStatPort.ts         # Deno.statSync-backed FileStatPort for config validation
│   ├── permissions.ts              # Runtime permission preflight checks
│   ├── runMcpApp.ts                # Load config, build the app, start (used by main.ts)
│   ├── signals.ts                  # Signal handling for SIGINT, SIGTERM, etc.
│   └── stdio.ts                    # serveStdio wrapper + event-bus forwarder
├── kv/
│   ├── mod.ts                      # Exports Deno KV runtime and watcher helpers
│   ├── runtime.ts                  # KvRuntime: lazy process-scoped Deno.Kv handle
│   └── watch.ts                    # KV key watcher (drives resource_updated events)
├── mcp/
│   ├── context.ts                  # McpServerFactoryContext (kv, events, requestState, publicBaseUrl)
│   ├── inputResponses.ts           # Helpers for reading input_required answers (wasDeclined, samplingText)
│   ├── plugin-types.ts             # defineTool / definePrompt / registerResource and ResourceConfig for new MCP features
│   ├── requestState.ts             # HMAC codec for signed requestState
│   ├── prompts/
│   │   ├── codeReview.ts           # A code-review prompt example
│   │   ├── languagePrompt.ts       # A prompt example with arguments + completions
│   │   ├── test*.ts                # Conformance showcase prompts
│   │   └── mod.ts                  # Provides a single point of export for all MCP prompts
│   ├── resources/
│   │   ├── counter.ts              # A stateful resource example
│   │   ├── counterStore.ts         # Persistence for counter resource state
│   │   ├── greetings.ts            # A dynamic resource template example
│   │   ├── helloWorld.ts           # A direct resource example
│   │   ├── kvKeys.ts               # URI -> KV key map watched for resource_updated
│   │   ├── test*.ts                # Conformance showcase resources
│   │   └── mod.ts                  # Provides a single point of export for all MCP resources
│   ├── apps/
│   │   ├── fetchWebsiteInfoApp.ts  # MCP App UI registration (ext-apps) for fetch-website-info
│   │   └── mod.ts                  # Provides a single point of export for all MCP Apps
│   ├── showcase/
│   │   └── sharedConstants.ts      # Shared fixtures for the test* conformance features
│   ├── tools/
│   │   ├── echo.ts                 # The smallest useful tool; start from this one
│   │   ├── elicitFormWizard.ts     # Two-step form elicitation with signed requestState
│   │   ├── elicitInput.ts          # A form elicitation tool example (input_required)
│   │   ├── fetchWebsiteInfoShared.ts # Shared logic for fetch-website-info (HEAD + structured output)
│   │   ├── incrementCounter.ts     # A tool that updates a resource-backed counter
│   │   ├── logMessage.ts           # A logging notification example
│   │   ├── notifyListChanged.ts    # A list-changed notification example (publishes on the event bus)
│   │   ├── poem.ts                 # A sampling tool example (input_required)
│   │   ├── sandbox.ts              # Sandboxed code execution via Deno Sandbox (microVM)
│   │   ├── test*.ts                # Conformance showcase tools
│   │   ├── urlElicitationDemo.ts   # URL-mode elicitation demo (HTTP + browser confirm)
│   │   └── mod.ts                  # Provides a single point of export for all MCP tools
│   ├── urlElicitation/
│   │   └── store.ts                # Pending URL elicitations in KV
│   ├── serverDefinition.ts         # Feature registry, derived server capabilities, SERVER_INFO and SERVER_INSTRUCTIONS
│   └── mod.ts                      # createMcpServer: builds and configures the McpServer
├── shared/
│   ├── constants/
│   │   ├── app.ts                  # Constants for the App (e.g., name, description, etc.)
│   │   ├── http.ts                 # Constants for the HTTP server (e.g., headers, ports, etc.)
│   │   └── mcp.ts                  # MCP server info/capabilities, requestState key/TTL constants
│   ├── validation/
│   │   ├── config.ts               # Validation of the AppConfig object
│   │   ├── header.ts               # Validation for headers
│   │   ├── host.ts                 # Validation for hosts
│   │   ├── hostname.ts             # Validation for hostnames
│   │   ├── origin.ts               # Validation for origins
│   │   ├── port.ts                 # Validation for ports
│   │   └── safeToolFetchUrl.ts     # SSRF policy for fetch-website-info
│   ├── publicBaseUrl.ts            # Resolve MCP_PUBLIC_BASE_URL / dev default for browser links
│   ├── constants.ts                # Single point of export for all shared constants
│   ├── config-input.ts             # Neutral config input for validation
│   ├── config-types.ts             # AppConfig, HTTP/STDIO/KV (host shell)
│   ├── httpSecurityPolicy.ts       # HTTP listen safety policy derived from config
│   ├── type-utils.ts               # Prettify and small TS utilities
│   ├── utils.ts                    # Shared utility functions (call-tool response helpers)
│   └── validation.ts               # Single point of export for all shared validation functions
static/
├── .well-known/
│   ├── llms.txt                    # An example llms.txt giving LLMs information about the server
│   └── openapi.yaml                # An example OpenAPI specification for the server
├── mcp-apps/
│   └── fetch-website-info.html     # Built MCP App bundle (run `deno task build:mcp-ui`)
├── 404.html                        # Default static 404 page
├── banner_*.png, favicon.ico, icon.*  # Images
├── mcpb-launcher.sh                # Picks the right binary for the platform in an MCPB bundle
└── mcpb-manifest.json              # The manifest for the MCPB package
```

## Code Style Guidelines

Deno: This project uses Deno exclusively. Follow Deno standards and best practice.
Imports: Use JSR imports (`jsr:`) or npm imports (`npm:`) with explicit paths. ES module style, include `.ts` extension. Group imports logically.
Structure: The entrypoint is `main.ts`. Core functionality is in `src/`. `src/app` wraps the MCP server from `src/mcp` in some convenience functions for serving HTTP, etc.
TypeScript: Strict type checking, ES modules, explicit return types
Naming: PascalCase for classes/types, camelCase for functions/variables
Files: camelCase in `src/` and lowercase with hyphens in `__test__/`, with a `.test.ts` suffix
Error Handling: Use TypeScript's strict mode, explicit error checking in tests
Formatting: 2-space indentation, semicolons required, double quotes preferred
Testing: Locate tests in `__test__/`, use descriptive test names. We use `deno test` for testing. A test that spawns a process goes in the `--ignore` list and the `--allow-run` second pass of `test:integration` and `test:coverage` in `deno.json`.
Comments: JSDoc for public APIs, inline comments for complex logic

## Best Practices

Environment Variables: Parse env vars and CLI flags in `src/app/cli.ts`. Local run tasks load `.env` via `--env-file=.env`. `MCP_REQUEST_STATE_KEY` signs multi-round `requestState` (32+ bytes).
File Paths: Use `@std/path` for cross-platform file path handling
Data Validation: Use `zod` schemas for data validation
HTTP Responses: Return proper status codes and structured JSON responses, including JSONRPC when necessary.
Transactions: Use `kv.atomic()` for Deno KV transactions when updating multiple records
Error Handling: Provide detailed error messages but avoid exposing sensitive information
Tool Implementation: Use `defineTool` / `definePrompt` / `registerResource` from `src/mcp/plugin-types.ts` (handlers get `(args, ctx, deps)`); see `.agents/skills/`. Declare `annotations` on every tool, and an `outputSchema` with matching `structuredContent` when the result has a fixed shape.

## Docs

[MCP Spec](https://modelcontextprotocol.io/specification/2026-07-28)
[MCP Concepts](https://modelcontextprotocol.io/docs/concepts/)
[MCP Server Features](https://modelcontextprotocol.io/specification/2026-07-28/server/index)
[Hono Docs](https://hono.dev/docs/)
[Deno Docs](https://docs.deno.com/)
[Zod Docs](https://zod.dev/)
