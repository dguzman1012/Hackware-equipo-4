# Shared paths for verify-novia helpers. Source only; do not execute.
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${SKILL_DIR}/../../.." && pwd)"
STATE_ROOT="${VERIFY_STATE_ROOT:-${SKILL_DIR}/.run}"
CURRENT_FILE="${STATE_ROOT}/current"
ESP_PORT=4210
DEFAULT_PORT="${VERIFY_PORT:-8080}"

resolve_run_dir() {
  if [[ -n "${VERIFY_RUN_DIR:-}" ]]; then
    printf '%s\n' "${VERIFY_RUN_DIR}"
    return 0
  fi
  if [[ -f "${CURRENT_FILE}" ]]; then
    local id
    id="$(cat "${CURRENT_FILE}")"
    printf '%s\n' "${STATE_ROOT}/${id}"
    return 0
  fi
  echo "verify-novia: no run dir. Run scripts/launch.sh first." >&2
  return 1
}

read_meta() {
  local key="$1"
  local dir
  dir="$(resolve_run_dir)" || return 1
  [[ -f "${dir}/meta.env" ]] || {
    echo "verify-novia: missing ${dir}/meta.env" >&2
    return 1
  }
  # shellcheck disable=SC1091
  source "${dir}/meta.env"
  eval "printf '%s\\n' \"\${${key}:-}\""
}

port_in_use() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

udp_in_use() {
  local port="$1"
  lsof -nP -iUDP:"${port}" >/dev/null 2>&1
}

listener_pid() {
  local port="$1"
  lsof -nP -t -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | head -n 1
}
