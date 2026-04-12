# Versioning

This repository follows [Semantic Versioning 2.0.0](https://semver.org/) (`MAJOR.MINOR.PATCH`).

- **MAJOR** — Breaking changes for consumers of the published package or for operators who upgrade
without reading release notes.
- **MINOR** — New backward-compatible functionality (new optional env flags, new demo tools behind
defaults, additive MCP capabilities).
- **PATCH** — Backward-compatible bug fixes and documentation-only changes that do not alter runtime
behavior.

The canonical version for releases is `[deno.json](deno.json)` `version` (also reflected in JSR when
published).

## What counts as breaking

Treat the following as **breaking** (require a major bump when affecting supported upgrade paths):

- Removing or renaming **exports** in `deno.json` (`exports` map) or changing subpath meanings.
- Renaming or removing **CLI flags** or **environment variables** parsed in
`[src/app/cli.ts](src/app/cli.ts)` / `[src/shared/config-input.ts](src/shared/config-input.ts)`
without a deprecation period documented in [CHANGELOG.md](CHANGELOG.md).
- Changing **default** HTTP bind address, transport defaults, or security defaults in a way that can
expose or lock out existing deployments.
- Changing the `**deno task setup`** contract (renames it performs) in a way that breaks existing
forks’ automation.

The following are usually **non-breaking** if documented:

- Adding new optional configuration, new demo tools/resources/prompts, or new dependencies that do
not change existing APIs.
- Internal refactors with identical external behavior.

## Pre-1.0.0

While the major version is `0`, **minor** releases may include breaking changes for template
adopters. Patch releases should remain safe for drop-in upgrades within the same minor line. After
**1.0.0**, breaking changes require a major version bump.

## Communicating changes

- Every release with user-visible behavior changes gets an entry in [CHANGELOG.md](CHANGELOG.md).
- Security-sensitive fixes are also summarized in [SECURITY.md](SECURITY.md) when applicable.