#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5000}"
BASE_URL="${BASE_URL:-http://${HOST}:${PORT}}"
READY_PATH="${READY_PATH:-/api/production/ready}"
HEARTBEAT_PATH="${HEARTBEAT_PATH:-/api/production/queue/heartbeat}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-12}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"

info() { printf '👉 %s\n' "$*"; }
success() { printf '✅ %s\n' "$*"; }
error() { printf '❌ %s\n' "$*" >&2; }

ready_url="${BASE_URL%/}${READY_PATH}"
heartbeat_url="${BASE_URL%/}${HEARTBEAT_PATH}"

info "Polling readiness at ${ready_url}";

attempt=1
while (( attempt <= MAX_ATTEMPTS )); do
  if ! response=$(curl -sfS --max-time 5 -H 'Accept: application/json' "${ready_url}"); then
    info "Attempt ${attempt}/${MAX_ATTEMPTS}: API not ready yet (curl failed)."
  else
    queue_status=$(printf '%s' "${response}" | jq -r '.checks.queue.status // empty')
    queue_durable=$(printf '%s' "${response}" | jq -r '.checks.queue.durable // empty')
    message=$(printf '%s' "${response}" | jq -r '.checks.queue.message // empty')

    if [[ "${queue_status}" != "pass" || "${queue_durable}" == "false" ]]; then
      error "Queue is not healthy (status=${queue_status:-unknown}, durable=${queue_durable:-unknown})."
      [[ -n "${message}" ]] && error "Reason: ${message}"
      exit 1
    fi

    ready=$(printf '%s' "${response}" | jq -r '.ready')
    if [[ "${ready}" == "true" ]]; then
      success "API is ready and queue is healthy."
      break
    fi
  fi

  if (( attempt == MAX_ATTEMPTS )); then
    error "API did not report ready within $(( MAX_ATTEMPTS * SLEEP_SECONDS ))s."
    exit 2
  fi

  (( attempt++ ))
  sleep "${SLEEP_SECONDS}"
done

info "Fetching worker heartbeat from ${heartbeat_url}";
curl -sfS -H 'Accept: application/json' "${heartbeat_url}" | jq '.status, .worker, .queueDepths'
