#!/usr/bin/env bash
set -euo pipefail

# Runs @modelcontextprotocol/conformance against this repo's HTTP MCP endpoint.
# Requires Node.js (npx). Start from the repository root.
#
# Use http://localhost (not 127.0.0.1): the HTTP hostname defaults to localhost
# and may listen only on IPv6 (::1) on some systems, so 127.0.0.1 can fail.
#
# Usage:
#   ./scripts/run-mcp-conformance.sh [--verbose] [--scenario NAME] ...
# With baseline (conformance-baseline.yml present):
#   expected failures are ignored for CI stability.
#
# Conformance server env (set automatically below):
#   MCP_HTTP_RATE_LIMIT_ENABLED=false — avoid 429 during the full active suite
# The default server already registers `test_*` / `test://` showcase features.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${MCP_HTTP_PORT:-3001}"
URL="http://localhost:${PORT}/mcp"
BASELINE="$ROOT/conformance-baseline.yml"
CONFORMANCE_CLI_VERSION="${MCP_CONFORMANCE_CLI_VERSION:-0.1.16}"

export MCP_HTTP_RATE_LIMIT_ENABLED=false

if command -v lsof >/dev/null 2>&1; then
  lsof -ti ":${PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 0.2
fi

deno run -A main.ts --no-stdio --no-http-rate-limit &
PID=$!

cleanup() {
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
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

set +e
# shellcheck disable=SC2068
npx --yes "@modelcontextprotocol/conformance@${CONFORMANCE_CLI_VERSION}" server --url "$URL" ${extra[@]+"${extra[@]}"} "$@"
ec=$?
set -e
exit "$ec"
