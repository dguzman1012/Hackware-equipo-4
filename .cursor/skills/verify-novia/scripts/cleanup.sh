#!/usr/bin/env bash
# Tear down only the instance this skill started. Proof artifacts stay.
# Usage: scripts/cleanup.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

if [[ ! -f "${CURRENT_FILE}" && -z "${VERIFY_RUN_DIR:-}" ]]; then
  echo "verify-novia: no current run to clean"
  exit 0
fi

RUN_DIR="$(resolve_run_dir)" || exit 0
if [[ ! -f "${RUN_DIR}/meta.env" ]]; then
  echo "verify-novia: no meta.env at ${RUN_DIR}"
  rm -f "${CURRENT_FILE}"
  exit 0
fi
# shellcheck disable=SC1091
source "${RUN_DIR}/meta.env"

descendants() {
  local pid="$1"
  local kids
  kids="$(pgrep -P "${pid}" 2>/dev/null || true)"
  for k in ${kids}; do
    descendants "${k}"
    printf '%s\n' "${k}"
  done
}

stop_pid() {
  local pid="$1"
  local name="$2"
  if [[ -z "${pid}" ]]; then
    return 0
  fi
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "verify-novia: ${name} pid ${pid} already gone"
    return 0
  fi
  kill "${pid}" 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! kill -0 "${pid}" 2>/dev/null; then
      echo "verify-novia: stopped ${name} pid ${pid}"
      return 0
    fi
    sleep 0.1
  done
  kill -9 "${pid}" 2>/dev/null || true
  echo "verify-novia: force-stopped ${name} pid ${pid}"
}

stop_tree() {
  local pid="$1"
  local name="$2"
  [[ -n "${pid}" ]] || return 0
  local child
  while read -r child; do
    [[ -n "${child}" ]] || continue
    stop_pid "${child}" "${name}-child"
  done < <(descendants "${pid}")
  stop_pid "${pid}" "${name}"
}

stop_tree "${SERVER_PID:-}" "server"
stop_tree "${SIM_PID:-}" "esp-sim"

if [[ -n "${PORT:-}" ]] && port_in_use "${PORT}"; then
  leftover="$(listener_pid "${PORT}" || true)"
  if [[ -n "${leftover}" ]]; then
    cmd="$(ps -o command= -p "${leftover}" 2>/dev/null || true)"
    if [[ "${cmd}" == *"${REPO_ROOT}"* || "${cmd}" == *tsx* ]]; then
      stop_pid "${leftover}" "http-listener"
    else
      echo "verify-novia: warning — TCP ${PORT} still has listener ${leftover}" >&2
    fi
  fi
fi

rm -f "${CURRENT_FILE}"
echo "verify-novia: cleanup done. Evidence stays at ${EVIDENCE_DIR:-${SKILL_DIR}/artifacts}"
