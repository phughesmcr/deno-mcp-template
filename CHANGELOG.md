# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  org and app access first, masks org slugs in the log, smoke-tests the deployed URL, and prints app
  logs on failure.
- `release.yml` is merged into `publish.yml`: a tag must match `deno.json`, CI runs before publishing,
  and the GitHub release is only created after a successful JSR publish.
- Workflows pin actions to commit SHAs and set read-only `permissions`. All except `publish.yml` set
  `concurrency`.
- Stricter compiler options and lint rules, a two-day `minimumDependencyAge`, and the JSR package
  no longer ships tests, scripts or repository tooling.
- Agent rules moved to `AGENTS.md` and skills to `.agents/skills/`. `CONTRIBUTING.md` and
  `SECURITY.md` moved to `.github/`.
- CI pins Deno 2.9.8.
- **BREAKING:** `/mcp` answers 403 to an `Origin` not in `MCP_ALLOWED_ORIGINS`, including preflights.
- `deno task start`, `dev`, the compile tasks and the `main.ts` shebang use explicit `--allow-*` flags
  instead of `-A`. The startup check accepts read, write and net scoped to what the server needs, and
  no longer asks for `--allow-sys`.
- `execute-code` is no longer marked read-only. `fetch-website-info` and `execute-code` use
  `AbortSignal.timeout` and `AbortSignal.any`, so client cancellation stops a running fetch, and
  `execute-code` stops code with SIGKILL.
- `getRejected` returns an `AggregateError` when several promises rejected.
- `deno task ci` also checks `mcp-ui`, which moves to `lib: ESNext`, Vite 6.4.5 and modules split out
  of `mcp-app.ts`, and drops `typescript` and `skipLibCheck`. Its tests run on the real page with
  linkedom.
- MCP App: tool results are validated with zod, text from a non-error result is no longer shown as
  an error, status messages are announced to screen readers, and the host border is turned off.
- **BREAKING:** `deno task setup` no longer accepts `--deno-deploy-app`. It needs a clean tree or
  `--allow-dirty`, and resets the version and changelog.
- Unknown flags are errors in `setup`, `strip` and `deploy:setup`.
- `scripts/*` tasks use scoped permissions, except `deploy:setup`.

### Deprecated

- Sampling, roots and logging are deprecated by SEP-2577, still in the spec for at least twelve
  months. Their demos stay and are now marked.

### Removed

- **BREAKING:** `x-api-key` as a credential. Use `Authorization: Bearer`.
- `src/kv/store.ts` (`openKvStore`, `closeKvStore`, `configureKvPath`). Use `getProcessKvRuntime()`.
- **BREAKING:** MCP sessions, the KV event store, experimental MCP tasks, `Deno.cron` maintenance,
  `MCP_MAX_TASK_TTL_MS` / `--max-task-ttl-ms`, and the `delayed-echo` and `guided-poem` tools.
- `AUTHORS.md`, `CONTRIBUTORS.md`, `SUPPORT.md` and `.cursorignore`.

### Fixed

- STDIO-only servers exit when stdin closes.
- 401 responses send `WWW-Authenticate: Bearer`, and CORS exposes it.
- `/favicon.ico` and `/static/*` no longer return 404 for files that exist.
- The MCP App bundle was built from an incomplete page and failed before connecting to the host.
- Unhandled rejections and `beforeunload` let shutdown finish, and shutdown failures are logged.
- HTTP stop refuses late requests instead of answering 500.
- Malformed IPv6 addresses no longer count as rate-limit identities.
- `increment-counter` returns the value it wrote, not one that may include a concurrent increment.
- A throwing KV watch callback no longer ends the watch. `KvWatcher.watch()` resolves after the
  initial snapshot, and `stop()` also ends watches still being set up.
- `greetings://` reports a bad name as `InvalidParams` instead of an internal error.
- **Security:** the server-side fetch filter let through IPv4 addresses embedded in IPv6
  (`[::ffff:127.0.0.1]`, NAT64, 6to4), `[::]`, blocked hostnames with a trailing dot, and several
  reserved IPv4 ranges. IPv6 is now parsed, and only global unicast is allowed.
- Stdio examples pass `--no-http`, so a second client no longer crashes on `AddrInUse`.
- `deno task setup` formats the code afterwards, so `deno task ci` passes straight after it.
- Claude Code finds the agent skills through a `.claude/skills` symlink.
- `compile:*` tasks passed `--target` and `--icon` after `main.ts`, baking them into the binary as
  script arguments: the target was ignored and the binary exited with a usage error.
- `clean:dist` no longer fails when `dist/` does not exist.
- Rate limiting runs after the bearer token check, so unauthenticated `/mcp` requests can't use up a
  limit shared with real clients. Failed token guesses are no longer rate limited.
- `compile:all` runs in sequence: parallel task dependencies raced clean and compile.
- `MCP_NO_HTTP` and `MCP_NO_STDIO` now disable their transports.
- MCP App: errors are readable on dark hosts, hosts that send only a theme get dark defaults, and
  the view shrinks again when content closes and follows `containerDimensions`.
- MCP App: connection, download and malformed-result failures are shown instead of being silent.
- MCP App: refreshing the resource list no longer duplicates entries, stale reads are dropped and all
  pages load.
- `deno task setup` no longer writes unescaped values, reports success after a failure, or ignores
  `--url`.

### Added

- Example tools declare accurate `annotations`. `fetch-website-info`, `increment-counter`, `poem` and
  `log-message` declare an `outputSchema` and return matching `structuredContent`.
- The server sends `instructions` and `websiteUrl`. `hello://world` and the MCP App HTML carry cache
  hints, and `ResourceConfig` in `plugin-types.ts` adds `cacheHint` to resource config.
- `deno task strip` reduces the template to a minimal server (`echo`, `hello://world`, `review-code`)
  that still passes `deno task ci`, and `strip.yml` checks it in CI.
- MCP Apps are listed in `src/mcp/apps/mod.ts`, and a `urlElicitation` flag in the server definition
  controls the `/mcp-elicitation/*` routes.
- SEP-1730-oriented issue labels (`deno task labels:github` / `scripts/setup-sep1730-labels.sh`), issue templates, and
  maintainer triage expectations in `.github/CONTRIBUTING.md`.
- `.github/dependabot.yml` for automated dependency update PRs where supported.
- `deno task deploy:setup` sets up a new Deno Deploy app with its KV database and variables, keeps
  secrets off the command line, and can be rerun. `scripts/smoke-deploy.ts` checks a deployed server
  answers MCP.
- `deno task conformance:server` runs the pinned `@modelcontextprotocol/conformance` 0.2.0-alpha.12
  with `--requirements 2026-07-28` against a local server, and CI runs it too.
- `MCP_ALLOWED_HOSTS` accepts `*.example.com`, matching one subdomain label.
- `.github/workflows/binaries.yml` and `scripts/smoke-binary.ts`: smoke test on all five binary
  targets.
- CI checks that `static/mcp-apps` matches a fresh build, that setup still works, and that the
  version in `deno.json`, `mcpb-manifest.json` and `openapi.yaml` agree.

## [0.7.0](https://github.com/phughesmcr/deno-mcp-template/releases/tag/v0.7.0) - 2026-04-12

Historical releases before this changelog file may be listed on
[GitHub Releases](https://github.com/phughesmcr/deno-mcp-template/releases).
