#!/usr/bin/env bash
# Start a disposable novia-de-gaucho instance for verification.
# Usage: scripts/launch.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

PORT="${VERIFY_PORT:-${DEFAULT_PORT}}"
RUN_ID="${VERIFY_RUN_ID:-$(date +%Y%m%d-%H%M%S)-$$}"
RUN_DIR="${STATE_ROOT}/${RUN_ID}"
EVIDENCE_DIR="${SKILL_DIR}/artifacts/${RUN_ID}"

if [[ -f "${CURRENT_FILE}" ]]; then
  echo "verify-novia: a verification instance already exists ($(cat "${CURRENT_FILE}"))." >&2
  echo "verify-novia: run scripts/cleanup.sh first. Do not drive a shared instance." >&2
  exit 2
fi

if port_in_use "${PORT}"; then
  echo "verify-novia: TCP ${PORT} is already in use. Refuse to share the port." >&2
  exit 2
fi

if udp_in_use "${ESP_PORT}"; then
  echo "verify-novia: UDP ${ESP_PORT} is already in use. Only one server can bind this port." >&2
  exit 2
fi

mkdir -p "${RUN_DIR}" "${EVIDENCE_DIR}" "${STATE_ROOT}"

if [[ ! -d "${REPO_ROOT}/node_modules" ]]; then
  echo "verify-novia: install deps"
  (cd "${REPO_ROOT}" && pnpm install)
fi

if [[ ! -f "${REPO_ROOT}/web/dist/index.html" ]]; then
  echo "verify-novia: build web"
  (cd "${REPO_ROOT}" && pnpm --filter web build)
fi

# Override .env. CERT_DIR points at an empty dir so this run does not bind HTTPS.
export READER=mock
export PORT
export CERT_DIR="${RUN_DIR}/no-certs"
export SIM_SERVER_IP=127.0.0.1
export SIM_PORT=4211
mkdir -p "${CERT_DIR}"

echo "verify-novia: start server on :${PORT}"
nohup env READER=mock PORT="${PORT}" CERT_DIR="${CERT_DIR}" \
  pnpm --dir "${REPO_ROOT}" --filter server start \
  >"${RUN_DIR}/server.log" 2>&1 &
SERVER_PID=$!
disown "${SERVER_PID}" 2>/dev/null || true

echo "verify-novia: start esp-sim"
nohup env SIM_SERVER_IP=127.0.0.1 SIM_PORT=4211 \
  pnpm --dir "${REPO_ROOT}" sim:esp32 \
  >"${RUN_DIR}/sim.log" 2>&1 &
SIM_PID=$!
disown "${SIM_PID}" 2>/dev/null || true

cat >"${RUN_DIR}/meta.env" <<EOF
RUN_ID=${RUN_ID}
PORT=${PORT}
BASE_URL=http://127.0.0.1:${PORT}
CONTROL_URL=http://127.0.0.1:${PORT}/#control
VIEWER_URL=http://127.0.0.1:${PORT}/#viewer
FACE_URL=http://127.0.0.1:${PORT}/#face
WS_URL=ws://127.0.0.1:${PORT}/ws?role=control
SERVER_PID=${SERVER_PID}
SIM_PID=${SIM_PID}
REPO_ROOT=${REPO_ROOT}
EVIDENCE_DIR=${EVIDENCE_DIR}
EOF

printf '%s\n' "${RUN_ID}" >"${CURRENT_FILE}"

ready=0
for _ in $(seq 1 40); do
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "verify-novia: server exited. See ${RUN_DIR}/server.log" >&2
    rm -f "${CURRENT_FILE}"
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done

if [[ "${ready}" -ne 1 ]]; then
  echo "verify-novia: /health did not answer. See ${RUN_DIR}/server.log" >&2
  kill "${SERVER_PID}" "${SIM_PID}" 2>/dev/null || true
  rm -f "${CURRENT_FILE}"
  exit 1
fi

echo "verify-novia: ready"
echo "RUN_ID=${RUN_ID}"
echo "RUN_DIR=${RUN_DIR}"
echo "EVIDENCE_DIR=${EVIDENCE_DIR}"
echo "BASE_URL=http://127.0.0.1:${PORT}"
echo "CONTROL_URL=http://127.0.0.1:${PORT}/#control"
echo "VIEWER_URL=http://127.0.0.1:${PORT}/#viewer"
echo "FACE_URL=http://127.0.0.1:${PORT}/#face"
