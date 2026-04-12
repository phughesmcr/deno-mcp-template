# Dependency update policy

This project uses **Deno** with dependencies declared in [`deno.json`](deno.json) (`imports` and
`compilerOptions`) and locked in [`deno.lock`](deno.lock).

## Principles

1. **Reproducible installs** — Commit `deno.lock` with application code changes. CI uses
   `deno install --frozen --entrypoint main.ts` (or equivalent) so dependency updates are explicit
   in PRs.
2. **Reviewable bumps** — Dependency updates should be reviewable diffs (lockfile + `deno.json` when
   import specifiers change).
3. **Security** — Apply security patches promptly; use `deno outdated` / upstream advisories /
   Dependabot alerts as signals.

## Automated updates (Dependabot)

When [`.github/dependabot.yml`](.github/dependabot.yml) is present:

- **GitHub Actions** workflow dependencies are updated on a weekly schedule.
- **Deno** ecosystem updates are requested for the repository root when the `deno` package ecosystem
  is enabled for the repo.

If Dependabot’s `deno` ecosystem is unavailable or fails validation for this repository, maintainers
rely on **manual** updates:

```bash
deno outdated
deno install --entrypoint main.ts --frozen=false
# run tests, then commit deno.json + deno.lock
```

Document manual bumps in the PR description (what changed, why).

## Tooling pins

- **MCP conformance CLI** — Version is pinned in [`deno.json`](deno.json) tasks (`conformance:list`,
  `conformance:server` via [`scripts/run-mcp-conformance.sh`](scripts/run-mcp-conformance.sh) using
  `MCP_CONFORMANCE_CLI_VERSION`). Bump intentionally when validating against a new
  `@modelcontextprotocol/conformance` release.
- **npm-specified packages** (e.g. `@modelcontextprotocol/sdk`) — Resolved through Deno’s npm
  compatibility and recorded in `deno.lock`.

## MCP UI (`mcp-ui/`)

The `mcp-ui/` subtree has its own Deno + Vite lockfile. When adding a root-level **npm** Dependabot
entry scoped to `mcp-ui/`, align this section with that schedule.
