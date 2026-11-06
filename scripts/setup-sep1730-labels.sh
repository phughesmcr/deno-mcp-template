#!/usr/bin/env bash
# Creates or updates SEP-1730–oriented GitHub labels for this repository.
# Requires: gh CLI (https://cli.github.com/) with repo scope, run from repo root.
# Usage: ./scripts/setup-sep1730-labels.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: https://cli.github.com/" >&2
  exit 1
fi

while IFS='|' read -r name color desc; do
  [[ -z "${name:-}" || "$name" =~ ^# ]] && continue
  gh label create "$name" --color "$color" --description "$desc" --force
done <<'EOF'
P0|b60205|Critical — production outage, security issue, or data loss risk for template users
P1|d93f0b|High — major bug or regression affecting common workflows
P2|fbca04|Medium — noticeable bug or missing behavior with workaround
P3|0e8a16|Low — minor issue, cosmetic, or nice-to-have
needs repro|d4c5f9|More information needed to reproduce
needs confirmation|bfdadc|Awaiting reporter or maintainer confirmation
ready for work|0e8a16|Triaged; ready for a contributor to pick up
bug|d73a4a|Something is broken
enhancement|a2eeef|Improvement or new feature
question|d876e3|Further information requested
good first issue|7057ff|Good for newcomers
help wanted|008672|Extra attention welcome
EOF

echo "Labels applied. Verify in GitHub: Settings → Labels"
