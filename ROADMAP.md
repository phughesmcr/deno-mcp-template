# Roadmap

This document tracks **concrete** work aligned with the
[Model Context Protocol](https://modelcontextprotocol.io/) specification and repository health
(including [SEP-1730](https://github.com/modelcontextprotocol/modelcontextprotocol) governance-style
expectations for projects that opt in).

## Near term

- **Server conformance** — Keep `deno task conformance:server` (pinned
  [`@modelcontextprotocol/conformance`](https://www.npmjs.com/package/@modelcontextprotocol/conformance))
  passing on date-versioned scenarios; extend CI coverage as scenarios evolve.
- **Governance** — Maintain [VERSIONING.md](VERSIONING.md), [CHANGELOG.md](CHANGELOG.md),
  [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md), SEP-1730 label set, and triage SLAs documented in
  [CONTRIBUTING.md](CONTRIBUTING.md).

## Deferred (optional Tier 2 / Tier 1 completeness)

These are **not** required to use or fork this template; they matter only if you want external
tier-style audits to score every axis:

- **Stable ≥ 1.0.0** — Cut a semver-stable major release when the public API and defaults are ready
  for stricter compatibility promises (see [VERSIONING.md](VERSIONING.md)).
- **Client conformance** — A `--client-cmd` harness for
  [`conformance tier-check`](https://www.npmjs.com/package/@modelcontextprotocol/conformance) so
  **client** scenarios run at 100% (this repo is primarily a **server** template; the official
  TypeScript SDK ships a reference client for that purpose).
- **Auth-heavy client scenarios** — OAuth-related conformance may require extra stubs or
  infrastructure; evaluate against upstream scenario lists before committing.

## Out of scope (by design)

- **Full SDK-style documentation** of every MCP feature for **library consumers** — This repository
  is a **server template**, not the `@modelcontextprotocol/sdk` package. Link to upstream docs for
  client-only features (e.g. roots on the client) when relevant.
