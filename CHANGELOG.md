# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as described in
[VERSIONING.md](VERSIONING.md).

## [Unreleased](https://github.com/phughesmcr/deno-mcp-template/compare/v0.8.0...HEAD)

## [0.8.0](https://github.com/phughesmcr/deno-mcp-template/releases/tag/v0.8.0) - 2026-11-06

### Changed

- **BREAKING:** Rewritten on `@modelcontextprotocol/server` 2.4 for Deno 2.9.8. The server is
  stateless and speaks protocol revision 2026-07-28 only (`legacy: "reject"` on both transports), so
  2025-era clients are refused.
- **BREAKING:** `/mcp` is POST-only (other methods get 405) and CORS allows only `POST`. HTTP uses `createMcpHandler`, stdio uses `serveStdio`.
- **BREAKING:** `defineTool`, `definePrompt` and `registerResource` handlers now receive
  `(args, ctx, deps)`; `createMcpServer` takes the factory context directly.
- Elicitation and sampling use `inputRequired` results with signed `requestState`
  (`MCP_REQUEST_STATE_KEY`), and URL elicitation state lives in KV.
- Change notifications go through `subscriptions/listen`, fed by a `ServerEventBus` and KV watches.
- DXT packaging replaced by MCP Bundles (`deno task mcpb:all`, `static/mcpb-manifest.json`): one
  bundle holds all five binaries, and `static/mcpb-launcher.sh` picks one by platform.
- HTTP logs requests the SDK refuses as one line instead of a stack trace.
- CI runs on `dev` and passes `DENO_DEPLOY_TOKEN`, so the real sandbox test runs.
- `deploy.yml` has a `prod` dispatch input (default false), so a manual run makes a preview. It checks
  org and app access first, smoke-tests the deployed URL, and prints app logs on failure.
- Agent rules and skills moved from `.cursor/` to `.agents/`.
- Conformance runs `--requirements 2026-07-28` on `@modelcontextprotocol/conformance`
  0.2.0-alpha.12, and CI pins Deno 2.9.8.

### Removed

- **BREAKING:** MCP sessions, the KV event store, experimental MCP tasks, `Deno.cron` maintenance,
  `MCP_MAX_TASK_TTL_MS` / `--max-task-ttl-ms`, and the `delayed-echo` and `guided-poem` tools.

### Fixed

- `compile:*` tasks passed `--target` and `--icon` after `main.ts`, baking them into the binary as
  script arguments: the target was ignored and the binary exited with a usage error.
- `clean:dist` no longer fails when `dist/` does not exist.
- Rate limiting runs after the bearer token check, so unauthenticated `/mcp` requests can't use up a
  limit shared with real clients. Failed token guesses are no longer rate limited.
- README: Deno Deploy needs a KV database attached and `MCP_ALLOWED_HOSTS` set before the server
  will start and accept requests, and all clients there share the unknown-client rate limit.
- `compile:all` and `mcpb:all` run in sequence: parallel task dependencies raced clean, compile and
  pack.

### Added

- Governance documentation: `VERSIONING.md`, `DEPENDENCY_POLICY.md`, `ROADMAP.md`, SEP-1730-oriented
  issue labels (`deno task labels:github` / `scripts/setup-sep1730-labels.sh`), issue templates, and
  maintainer triage expectations in `CONTRIBUTING.md`.
- `.github/dependabot.yml` for automated dependency update PRs where supported.
- `deno task deploy:setup` sets up a new Deno Deploy app, and `scripts/smoke-deploy.ts` checks a
  deployed server answers MCP.
- `MCP_ALLOWED_HOSTS` accepts `*.example.com`, matching one subdomain label.
- `.github/workflows/binaries.yml` and `scripts/smoke-binary.ts`: smoke test on all five binary
  targets.

## [0.7.0](https://github.com/phughesmcr/deno-mcp-template/releases/tag/v0.7.0) - 2026-04-12

Historical releases before this changelog file may be listed on
[GitHub Releases](https://github.com/phughesmcr/deno-mcp-template/releases).
