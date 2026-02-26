# Architecture Deep Dive

This document captures the detailed reference content that was intentionally moved out of the
top-level README for a faster onboarding experience.

Use this doc when you want implementation-level context for transports, file layout, example MCP
features, and Deno runtime capabilities used by this template.

## 1) Architecture Overview

### `src/mcp/` and `src/app/` responsibilities

- `src/mcp/` contains the MCP server itself: prompts, resources, tools, and task workflows.
- `src/app/` wraps the MCP server with runtime concerns: transport bootstrapping, HTTP routing,
  lifecycle management, permissions preflight, KV setup, and cron startup.

This separation keeps MCP feature code focused while giving you a reusable host shell with sane
defaults.

### HTTP server design

The app uses `Deno.serve` with Hono to expose MCP over HTTP. The HTTP stack includes middleware
for:

- rate limiting
- CORS controls
- security headers
- request timeouts
- session handling

### Security and transport defaults

- DNS rebinding protection is disabled by default.
  - Enable with `MCP_DNS_REBINDING=true` or `--dnsRebinding`.
  - Configure `MCP_ALLOWED_ORIGINS` and `MCP_ALLOWED_HOSTS`.
- CORS allowed origins default to an empty list.
  - Browser clients need `MCP_ALLOWED_ORIGINS` (or `--origin`) configured.
- HTTP transport is enabled by default.
  - Disable with `MCP_NO_HTTP=true` or `--no-http`.
- STDIO transport is enabled by default.
  - Disable with `MCP_NO_STDIO=true` or `--no-stdio`.

## 2) Project Structure (Full Tree)

The repository is structured to be easy for both humans and coding agents to parse: files are
grouped by feature and generally kept small.

`src/app/` provides the runtime shell around the MCP server.

`src/mcp/` contains MCP feature implementations and server wiring.

```markdown
deno.json     # Project configuration
main.ts       # The main entry point
src/
├── app/
│   ├── http/
│   │   ├── handlers.ts             # HTTP handlers for the MCP server (GET, POST, etc.)
│   │   ├── hono.ts                 # Manages the Hono server, middleware, and routes
│   │   ├── kvEventStore.ts         # Simple Deno KV event store for for session resumability
│   │   ├── mod.ts                  # The main entrypoint for the HTTP server
│   │   └── transport.ts            # Manages the StreamableHTTPServerTransports
│   ├── kv/
│   │   ├── mod.ts                  # Exports Deno KV store and watcher helpers
│   │   ├── store.ts                # Deno KV open/close lifecycle and config
│   │   └── watch.ts                # Subscription watcher for resource updates
│   ├── app.ts                      # The main application class
│   ├── cli.ts                      # Parses CLI args and env vars into an AppConfig object
│   ├── cron.ts                     # Scheduled jobs (e.g., stale task cleanup)
│   ├── permissions.ts              # Runtime permission preflight checks
│   ├── signals.ts                  # Signal handling for SIGINT, SIGTERM, etc.
│   └── stdio.ts                    # The STDIO transport & state manager
├── mcp/
│   ├── prompts/
│   │   ├── codeReview.ts                   # A simple code-review prompt example
│   │   ├── languagePrompt.ts               # A prompt example with arguments
│   │   └── mod.ts                          # Provides a single point of export for all MCP prompts
│   ├── resources/
│   │   ├── counter.ts                      # A simple stateful resource example
│   │   ├── counterStore.ts                 # Persistence for counter resource state
│   │   ├── greetings.ts                    # A simple resource template (dynamic resource) example
│   │   ├── helloWorld.ts                   # A simple resource (direct resource) example
│   │   ├── kvKeys.ts                       # Shared keys used for KV-backed resources
│   │   ├── subscriptionTracker.ts          # Tracks active resource subscriptions
│   │   └── mod.ts                          # Provides a single point of export for all MCP resources
│   ├── tasks/
│   │   ├── kvTaskStore.ts                  # Durable task state storage in Deno KV
│   │   ├── queue.ts                        # Delayed task queue worker
│   │   └── mod.ts                          # Exports task queue and task store
│   ├── tools/
│   │   ├── elicitInput.ts                  # Elicitation tool example
│   │   ├── delayedEchoTask.ts              # Task-based async tool example
│   │   ├── domain.ts                       # Tool fetching website info via HTTP HEAD request
│   │   ├── guidedPoemTask.ts               # Task + sampling workflow example
│   │   ├── incrementCounter.ts             # Tool that updates resource-backed counter
│   │   ├── logMessage.ts                   # Logging notification example
│   │   ├── notifyListChanged.ts            # List-changed notification example
│   │   ├── poem.ts                         # Sampling tool example
│   │   ├── sandbox.ts                      # Sandboxed code execution via Deno Sandbox (microVM)
│   │   └── mod.ts                          # Provides a single point of export for all MCP tools
│   └── mod.ts                              # Creates and configures the MCP server
├── shared/
│   ├── constants/
│   │   ├── app.ts                  # Constants for the App (e.g., name, description, etc.)
│   │   ├── http.ts                 # Constants for the HTTP server (e.g., headers, ports, etc.)
│   │   └── mcp.ts                  # Constants for the MCP server (e.g., capabilities, etc.)
│   ├── validation/
│   │   ├── config.ts               # Validation of the AppConfig object
│   │   ├── header.ts               # Validation for headers
│   │   ├── host.ts                 # Validation for hosts
│   │   ├── hostname.ts             # Validation for hostnames
│   │   ├── origin.ts               # Validation for origins
│   │   └── port.ts                 # Validation for ports
│   ├── constants.ts                # Single point of export for all shared constants
│   ├── types.ts                    # Shared types
│   ├── utils.ts                    # Shared utility functions
│   └── validation.ts               # Single point of export for all shared validation functions
static/
├── .well-known/
│   ├── llms.txt                # An example llms.txt giving LLMs information about the server
│   └── openapi.yaml            # An example OpenAPI specification for the server
├── 404.html                    # Default static 404 page
└── dxt-manifest.json           # The manifest for the DXT package
```

## 3) Example Features Reference

These examples are intentionally broad and mostly mirror official MCP patterns.

### Prompts

- `review-code`
  - Creates a prompt message asking the model to review supplied code.
- `language-snippet`
  - Creates a prompt message to generate a short snippet for a language and goal.

### Resources

- `hello://world`
  - Returns a static plain-text hello-world resource.
- `greetings://{name}`
  - Returns a dynamic greeting resource for the provided name.
- `counter://value`
  - Returns the current KV-backed counter value and supports subscription updates.

### Tools

- `elicit-input`
  - Prompts the client for structured form input and returns the response.
- `fetch-website-info`
  - Performs an HTTP `HEAD` request and returns status and selected headers.
- `increment-counter`
  - Increments the KV-backed counter resource and returns the updated value.
- `log-message`
  - Sends a structured log notification to the connected client.
- `notify-list-changed`
  - Triggers tools/prompts/resources list-changed notifications.
- `poem`
  - Uses sampling to generate a poem from a text prompt.
- `execute-code`
  - Executes user-provided TypeScript or JavaScript via Deno Sandbox.

### Task-based tools (experimental)

- `delayed-echo`
  - Creates a background task that echoes text after a configurable delay.
- `guided-poem`
  - Runs a task workflow that elicits poem details, then samples a poem.

Task-based tools require MCP task support in the client. If a client does not support tasks,
these tools may not appear or execute.

### MCP patterns demonstrated

This template demonstrates:

- prompt creation with arguments
- static and dynamic resources
- resource subscription updates
- elicitation workflows
- sampling workflows
- list-changed notifications
- durable asynchronous task orchestration

## 4) Deno KV

Deno KV is a key-value database built directly into the Deno runtime and available via
`Deno.Kv`.

Reference: [Deno KV Manual](https://docs.deno.com/deploy/kv/manual/)

Key behavior:

- local development: file-backed KV database
- Deno Deploy: built-in KV service (no extra database service to provision)

In this template, KV is used for:

- HTTP event resumability
- durable task state and task results
- delayed task queue execution
- resource-backed counter persistence

## 5) Sandboxed Code Execution

This template includes an `execute-code` tool that runs untrusted TypeScript or JavaScript inside
[Deno Sandbox](https://docs.deno.com/sandbox/), backed by isolated Linux microVMs (Firecracker).

Execution model:

- each call runs in a fresh VM
- code runs with zero permissions
- no network, filesystem, or environment access
- VM is torn down automatically after execution

### Setup

1. Create an access token in the Deno Deploy dashboard under
   `Settings > Organization Tokens`.
2. Add the token to `.env`:

```env
DENO_DEPLOY_TOKEN=your_token_here
```

### `execute-code` API

Inputs:

- `code` (required)
- `language` (optional: `"typescript"` or `"javascript"`)
- `timeoutMs` (optional, default `5000`, max `30000`)

Output fields:

- `stdout`
- `stderr`
- `exitCode`
- `executionTimeMs`

Implementation reference: `src/mcp/tools/sandbox.ts`.

## 6) Maintenance Cron

Deno Cron (`Deno.cron`) is used for periodic maintenance without extra scheduler dependencies.

This template starts maintenance cron jobs during app startup (`src/app/app.ts`).

Current scheduled job:

- `cleanup-stale-tasks` in `src/app/cron.ts`
- schedule: every 15 minutes (`*/15 * * * *`)
- behavior: marks stale `"working"` tasks as `"failed"` after inactivity

This feature depends on unstable APIs enabled in `deno.json`:

```json
{
  "unstable": ["kv", "cron"]
}
```

## 7) Development Notes and Caveats

### Template identity cleanup

`deno task setup` updates core placeholders, but you should still do a final repository-wide pass
for names/emails/package identifiers before publishing.

### DNS rebinding and allowlists

If you enable `--dnsRebinding`, you may need to add origins/hosts in
`src/shared/constants/http.ts` or provide them at runtime with `--origin` and `--host`.

### Event store production warning

`src/app/http/kvEventStore.ts` is a simple session-resumability utility and is not intended as a
production-grade event store.

### Permissions warning

`deno task start` uses `deno run -A` for convenience. Before production deployment, move to
explicit permission flags and limit scope.

Reference:
[Deno security and permissions](https://docs.deno.com/runtime/fundamentals/security/)

### Static metadata files

Before shipping, check files in `static/`, especially:

- `static/.well-known/openapi.yaml`
- `static/.well-known/llms.txt`
- `static/dxt-manifest.json`

### Environment and CI/CD variables

When applicable, set required variables/secrets in both:

- GitHub repository settings
- Deno Deploy project settings

### Quality checks

Run:

- `deno task ci`
- `deno task test:coverage`
- `deno task bench`

## Further Reading

- [Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)
- [Model Context Protocol GitHub](https://github.com/modelcontextprotocol)
- [Deno Agent Skills](https://github.com/denoland/skills)
