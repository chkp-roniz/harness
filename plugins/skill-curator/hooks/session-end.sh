#!/usr/bin/env bash
# session-end.sh — Claude Code SessionEnd hook
#
# Captures session metadata to a pending queue for later curation review.
# Does NOT trigger Claude or perform analysis at session end.
# The skill-curator skill drains this queue when invoked.
#
# Hook contract: receives JSON on stdin with at least:
#   {session_id, transcript_path, cwd, reason}
# Exits 0 silently on filtered/skipped sessions.

set -euo pipefail

QUEUE_DIR="${HOME}/.claude/skill-curation"
QUEUE_FILE="${QUEUE_DIR}/pending-sessions.jsonl"
LOCK_FILE="${QUEUE_DIR}/pending-sessions.lock"
LOG_FILE="${QUEUE_DIR}/hook.log"
MIN_USER_TURNS="${SKILL_CURATOR_MIN_TURNS:-3}"

mkdir -p "$QUEUE_DIR"

# Read hook input
INPUT=$(cat)

# jq is required. If missing, log and exit cleanly.
if ! command -v jq >/dev/null 2>&1; then
  echo "$(date -u +%FT%TZ) [skip] jq not found" >> "$LOG_FILE"
  exit 0
fi

SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty')
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty')
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
REASON=$(printf '%s' "$INPUT" | jq -r '.reason // "unknown"')

# Skip if essential fields missing
if [[ -z "$SESSION_ID" || -z "$TRANSCRIPT_PATH" ]]; then
  echo "$(date -u +%FT%TZ) [skip] missing session_id or transcript_path" >> "$LOG_FILE"
  exit 0
fi

# Skip /clear sessions — they're not real work
if [[ "$REASON" == "clear" ]]; then
  echo "$(date -u +%FT%TZ) [skip] reason=clear session=$SESSION_ID" >> "$LOG_FILE"
  exit 0
fi

# Light substance filter: require at least N user turns
if [[ -f "$TRANSCRIPT_PATH" ]]; then
  USER_TURNS=$(grep -c '"role":"user"' "$TRANSCRIPT_PATH" 2>/dev/null || true)
  USER_TURNS=${USER_TURNS:-0}
  if (( USER_TURNS < MIN_USER_TURNS )); then
    echo "$(date -u +%FT%TZ) [skip] user_turns=$USER_TURNS < $MIN_USER_TURNS session=$SESSION_ID" >> "$LOG_FILE"
    exit 0
  fi
else
  echo "$(date -u +%FT%TZ) [skip] transcript_path missing: $TRANSCRIPT_PATH" >> "$LOG_FILE"
  exit 0
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ENTRY=$(jq -nc \
  --arg ts "$TIMESTAMP" \
  --arg sid "$SESSION_ID" \
  --arg tp "$TRANSCRIPT_PATH" \
  --arg cwd "$CWD" \
  --arg reason "$REASON" \
  '{timestamp: $ts, session_id: $sid, transcript_path: $tp, cwd: $cwd, reason: $reason, status: "pending"}')

# Append with flock if available; otherwise plain append
# (concurrent SessionEnd events are rare; plain append is acceptable as a fallback)
if command -v flock >/dev/null 2>&1; then
  (
    flock -x 9
    printf '%s\n' "$ENTRY" >> "$QUEUE_FILE"
  ) 9>>"$LOCK_FILE"
else
  printf '%s\n' "$ENTRY" >> "$QUEUE_FILE"
fi

echo "$(date -u +%FT%TZ) [queued] session=$SESSION_ID turns=$USER_TURNS" >> "$LOG_FILE"
exit 0
