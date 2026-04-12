# Contributing to deno-mcp-template

We love your input! We want to make contributing to this project as easy and
transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## We Develop with GitHub

We use GitHub to host code, to track issues and feature requests, as well as
accept pull requests.

## Any contributions you make will be under the MIT Software License

When you submit code changes, your submissions are understood to be under the
same [MIT License](http://choosealicense.com/licenses/mit/) that covers the
project. Feel free to contact the maintainers if that's a concern.

## Report bugs using GitHub's issues

We use GitHub issues to track public bugs. Report a bug by
[opening a new issue](https://github.com/phughesmcr/deno-mcp-template/issues).

## Write bug reports with detail, background, and sample code

Try to include:

- A quick summary and/or background
- Steps to reproduce
  - Be specific
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you
  tried that didn't work)

## Use a Consistent Coding Style

Please remember to use `deno fmt` and `deno lint` and fix any linter errors
before submitting pull requests

## Issue labels (SEP-1730)

Maintainers use this taxonomy so automated governance checks (for example MCP
tier-style audits) can measure triage. Apply **one priority** (`P0`–`P3`) and
workflow labels as appropriate.

| Label | Meaning |
| --- | --- |
| `P0` | Critical — security, data loss, or severe breakage for users of the template |
| `P1` | High — major bug or regression on common paths |
| `P2` | Medium — incorrect behavior with a workaround |
| `P3` | Low — minor issue, cosmetic, or nice-to-have |
| `needs repro` | More information or a reproducer is needed |
| `needs confirmation` | Waiting on reporter or maintainer to confirm behavior |
| `ready for work` | Triaged; safe for a contributor to pick up |

Type labels (`bug`, `enhancement`, `question`, `good first issue`, `help wanted`)
continue to describe the kind of work.

To create or refresh labels on GitHub, run from the repo root (requires
[GitHub CLI](https://cli.github.com/) `gh auth login`):

```bash
deno task labels:github
# or: ./scripts/setup-sep1730-labels.sh
```

## Maintainer triage and P0 handling

These targets align with SEP-1730-style expectations for projects that opt in.

| Standard | Triage deadline | Notes |
| --- | --- | --- |
| Baseline (Tier 2–oriented) | Within **one month** of filing | Apply correct type + priority + workflow labels, or close as duplicate / not planned |
| Stricter (Tier 1–oriented) | Within **2 business days** | Same labeling; tier-check computes compliance from label timestamps |
| `P0` resolution | **7 calendar days** from when `P0` is applied | Fix, ship a workaround in docs, or downgrade with a public rationale if not critical |

**P0** must never mean “we want this soon.” Reserve it for genuine emergencies.

Optional follow-up: add a scheduled workflow that comments when an issue has no
`P0`–`P3` label after 2 business days (heuristic reminder only; do not
auto-assign priority).
