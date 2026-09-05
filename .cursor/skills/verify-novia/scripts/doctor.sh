#!/usr/bin/env bash
# Read-only check: is this verification instance worth driving?
# Usage: scripts/doctor.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

RUN_DIR="$(resolve_run_dir)" || exit 1
# shellcheck disable=SC1091
source "${RUN_DIR}/meta.env"

fail() {
  echo "verify-novia doctor: FAIL — $1" >&2
  exit 1
}

[[ -n "${SERVER_PID:-}" ]] || fail "SERVER_PID missing in meta.env"
[[ -n "${PORT:-}" ]] || fail "PORT missing in meta.env"
kill -0 "${SERVER_PID}" 2>/dev/null || fail "server pid ${SERVER_PID} is not running"
if [[ -n "${SIM_PID:-}" ]]; then
  kill -0 "${SIM_PID}" 2>/dev/null || fail "esp-sim pid ${SIM_PID} is not running"
fi

owner="$(listener_pid "${PORT}" || true)"
[[ -n "${owner}" ]] || fail "nothing listens on TCP ${PORT}"
# pnpm start -> tsx -> node. Accept the listener if it is SERVER_PID or a descendant.
owned=0
cur="${owner}"
for _ in $(seq 1 8); do
  if [[ "${cur}" == "${SERVER_PID}" ]]; then
    owned=1
    break
  fi
  cur="$(ps -o ppid= -p "${cur}" 2>/dev/null | tr -d ' ')"
  [[ -n "${cur}" && "${cur}" != "1" ]] || break
done
[[ "${owned}" -eq 1 ]] || fail "TCP ${PORT} is owned by pid ${owner}, not this run (server ${SERVER_PID})"

health="$(curl -fsS "${BASE_URL}/health")" || fail "${BASE_URL}/health did not return 200"
echo "${health}" | grep -q '"ok":true' || fail "/health ok is not true"

reader_kind="$(printf '%s' "${health}" | sed -n 's/.*"kind":"\([^"]*\)".*/\1/p' | head -n 1)"
[[ "${reader_kind}" == "mock" ]] || fail "reader kind is '${reader_kind}', expected mock"

if [[ -f "${RUN_DIR}/server.log" ]]; then
  if grep -q 'run pnpm --filter web build' "${RUN_DIR}/server.log"; then
    fail "server log says web/dist is missing"
  fi
fi

echo "verify-novia doctor: OK"
echo "RUN_ID=${RUN_ID}"
echo "BASE_URL=${BASE_URL}"
echo "CONTROL_URL=${CONTROL_URL}"
echo "SERVER_PID=${SERVER_PID}"
echo "SIM_PID=${SIM_PID}"
echo "HEALTH=${health}"
echo "EVIDENCE_DIR=${EVIDENCE_DIR}"
