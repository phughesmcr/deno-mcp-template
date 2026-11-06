# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) as described in
[VERSIONING.md](VERSIONING.md).

## [Unreleased](https://github.com/phughesmcr/deno-mcp-template/compare/v0.7.0...HEAD)

### Changed

- **BREAKING:** Rewritten on `@modelcontextprotocol/server` 2.4 for Deno 2.9.8. The server is
  stateless and speaks protocol revision 2026-07-28 only (`legacy: "reject"` on both transports), so
  2025-era clients are refused.
- **BREAKING:** `/mcp` is POST-only. HTTP uses `createMcpHandler`, stdio uses `serveStdio`.
- **BREAKING:** `defineTool`, `definePrompt` and `registerResource` handlers now receive
  `(args, ctx, deps)`; `createMcpServer` takes the factory context directly.
- Elicitation and sampling use `inputRequired` results with signed `requestState`
  (`MCP_REQUEST_STATE_KEY`), and URL elicitation state lives in KV.
- Change notifications go through `subscriptions/listen`, fed by a `ServerEventBus` and KV watches.
- DXT packaging replaced by MCP Bundles (`deno task mcpb:*`, `static/mcpb-manifest.json`).
- Conformance runs `--requirements 2026-07-28` on `@modelcontextprotocol/conformance`
  0.2.0-alpha.12, and CI pins Deno 2.9.8.

### Removed

- **BREAKING:** MCP sessions, the KV event store, experimental MCP tasks, `Deno.cron` maintenance,
  `MCP_MAX_TASK_TTL_MS`, and the `delayed-echo` and `guided-poem` tools.

### Fixed

- `compile:*` tasks passed `--target` and `--icon` after `main.ts`, baking them into the binary as
  script arguments: the target was ignored and the binary exited with a usage error.
- `clean:dist` no longer fails when `dist/` does not exist.

### Added

- Governance documentation: `VERSIONING.md`, `DEPENDENCY_POLICY.md`, `ROADMAP.md`, SEP-1730-oriented
  issue labels (`deno task labels:github` / `scripts/setup-sep1730-labels.sh`), issue templates, and
  maintainer triage expectations in `CONTRIBUTING.md`.
- `.github/dependabot.yml` for automated dependency update PRs where supported.

## [0.7.0](https://github.com/phughesmcr/deno-mcp-template/releases/tag/v0.7.0) - 2026-04-12

Historical releases before this changelog file may be listed on
[GitHub Releases](https://github.com/phughesmcr/deno-mcp-template/releases).
