#!/usr/bin/env bash
set -euo pipefail

# Runs the 2026-07-28 requirements of @modelcontextprotocol/conformance against this
# repo's HTTP MCP endpoint.
# Requires Node.js (npx).
#
# Use http://localhost (not 127.0.0.1): the HTTP hostname defaults to localhost
# and may listen only on IPv6 (::1) on some systems, so 127.0.0.1 can fail.
#
# Usage:
#   ./scripts/run-mcp-conformance.sh [--verbose] [--scenario NAME] ...
#   ./scripts/run-mcp-conformance.sh --list    (lists the scenarios, no server needed)
# With baseline (scripts/conformance-baseline.yml present):
#   expected failures are ignored for CI stability. Scenarios the 2026-07-28 requirement set
#   does not score (such as tasks-*) are reported but cannot fail the run, baseline or not.
#
# Conformance server env (set automatically below):
#   MCP_HTTP_RATE_LIMIT_ENABLED=false — avoid 429 during the full active suite
# The default server already registers `test_*` / `test://` showcase features.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${MCP_PORT:-3001}"
URL="http://localhost:${PORT}/mcp"
BASELINE="$ROOT/scripts/conformance-baseline.yml"
CONFORMANCE_CLI_VERSION="${MCP_CONFORMANCE_CLI_VERSION:-0.2.0-alpha.12}"
CONFORMANCE_CLI="@modelcontextprotocol/conformance@${CONFORMANCE_CLI_VERSION}"

if [[ "${1:-}" == "--list" ]]; then
  exec npx --yes "$CONFORMANCE_CLI" list --server
fi

export MCP_PORT="$PORT"
# The suite sends this Origin, and the default allowlist is empty.
export MCP_ALLOWED_ORIGINS="http://localhost:${PORT}"
export MCP_HTTP_RATE_LIMIT_ENABLED=false

if (exec 3<>"/dev/tcp/localhost/${PORT}") 2>/dev/null; then
  echo "Port ${PORT} is in use. Stop what is using it, or set MCP_PORT to a free port." >&2
  exit 1
fi

# A store of its own, so the run neither reads nor changes the default one.
KV_DIR="$(mktemp -d)"
export MCP_KV_PATH="$KV_DIR/conformance.kv"

# The same permissions as `deno task start`, so a permission regression fails here.
deno run --allow-env --allow-net --allow-read --allow-write main.ts --no-stdio --no-http-rate-limit &
PID=$!

cleanup() {
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  rm -f "$KV_DIR"/conformance.kv*
  rmdir "$KV_DIR" 2>/dev/null || true
}
trap cleanup EXIT

echo "Waiting for ${URL} ..."
ready=0
for _ in $(seq 1 120); do
  if curl -sS -o /dev/null "$URL" 2>/dev/null; then
    ready=1
    echo "Server ready."
    break
  fi
  sleep 0.25
done

if [[ "$ready" -ne 1 ]]; then
  echo "Server did not become ready on ${URL} (is port ${PORT} free?)" >&2
  exit 1
fi

extra=()
if [[ -f "$BASELINE" ]]; then
  extra+=(--expected-failures "$BASELINE")
fi

# The CLI refuses --requirements together with --scenario.
requirements=(--requirements 2026-07-28)
for arg in "$@"; do
  if [[ "$arg" == "--scenario" || "$arg" == --scenario=* ]]; then
    requirements=()
  fi
done

set +e
npx --yes "$CONFORMANCE_CLI" server --url "$URL" ${requirements[@]+"${requirements[@]}"} ${extra[@]+"${extra[@]}"} "$@"
ec=$?
set -e
exit "$ec"
