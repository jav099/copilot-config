#!/usr/bin/env bash
#
# verify.sh — run the Dragon repo's CI-equivalent verification gate after a
# refactor, to prove no regressions were introduced. Mirrors the gates that
# actually block a merge in .github/workflows/ci.yml.
#
# Usage:
#   verify.sh [--fast] [--format-write] [workspace ...]
#
#   (no args)        Full gate: format → lint → server typecheck → client &
#                    chats build → tests for ALL workspaces.
#   --fast           Quick mid-iteration gate: format + lint + server typecheck
#                    only (skips builds and the test suites). Use while
#                    iterating; ALWAYS run the full gate before declaring done.
#   --format-write   Run `format` (mutating, auto-fixes) instead of the default
#                    non-mutating `format:check`.
#   workspace ...    Scope the TEST stage to specific npm workspaces
#                    (e.g. `server client chats`). Builds + global gates still
#                    run. Default = all workspaces via root `npm test`.
#
# Exit code: 0 if every gate passed, 1 if any gate failed. Each gate runs even
# if an earlier one fails, so you see the full picture in one run.
#
# Notes baked in from this repo's CI gotchas:
#   * Client TYPE errors are caught only by `npm run build -w client`
#     (tsc -b), NOT by `tsc --noEmit`. The build stage is the client typecheck.
#   * `npm run typecheck -w server` is required: vitest/esbuild strips types, so
#     `npm test` never catches server type errors — CI's tsc does.
#   * Server vitest flakes under CPU oversubscription at default parallelism;
#     this script pins `--maxWorkers=4`, which runs green reliably.
#   * FORMAT-GATE FALSE POSITIVE: `format:check` scans the working tree. Local
#     untracked artifacts (e.g. `.claude/worktrees/`) that CI never checks out
#     can make this gate fail on files your refactor never touched. If the
#     format gate fails, confirm the flagged paths are inside your change set
#     (`git status`); ignore failures that are purely untracked local noise.

set -uo pipefail

FAST=0
FORMAT_CMD="format:check"    # non-mutating by default (a verify gate, not a fixer)
WORKSPACES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fast) FAST=1 ;;
    --format-write) FORMAT_CMD="format" ;;
    -h|--help) sed -n '2,42p' "$0"; exit 0 ;;
    --*) echo "Unknown flag: $1" >&2; exit 2 ;;
    *) WORKSPACES+=("$1") ;;
  esac
  shift
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "FATAL: not inside a git repo" >&2; exit 2
}
cd "$ROOT" || exit 2

PASS=()
FAIL=()

run_gate() {
  local label="$1"; shift
  echo ""
  echo "━━━ $label ━━━"
  echo "\$ $*"
  if "$@"; then
    PASS+=("$label"); echo "✅ $label"
  else
    FAIL+=("$label"); echo "❌ $label"
  fi
}

# ── Global gates (always) ──────────────────────────────────────────────
run_gate "format ($FORMAT_CMD)" npm run "$FORMAT_CMD"
run_gate "lint (eslint)"        npm run lint
run_gate "typecheck (server)"   npm run typecheck -w server

if [[ "$FAST" -eq 1 ]]; then
  echo ""
  echo "── fast mode: skipping builds + tests ──"
else
  # ── Builds (client build doubles as the client typecheck) ────────────
  run_gate "build (client)" npm run build -w client
  run_gate "build (chats)"  npm run build -w chats

  # ── Tests ────────────────────────────────────────────────────────────
  if [[ "${#WORKSPACES[@]}" -eq 0 ]]; then
    run_gate "test (all workspaces)" npm test
  else
    for ws in "${WORKSPACES[@]}"; do
      if [[ "$ws" == "server" ]]; then
        run_gate "test ($ws)" npm test -w "$ws" -- --maxWorkers=4
      else
        run_gate "test ($ws)" npm test -w "$ws"
      fi
    done
  fi
fi

# ── Summary ────────────────────────────────────────────────────────────
echo ""
echo "════════════════ VERIFY SUMMARY ════════════════"
for g in "${PASS[@]:-}"; do [[ -n "$g" ]] && echo "  ✅ $g"; done
for g in "${FAIL[@]:-}"; do [[ -n "$g" ]] && echo "  ❌ $g"; done
echo "════════════════════════════════════════════════"

if [[ "${#FAIL[@]}" -gt 0 ]]; then
  echo "GATE FAILED: ${#FAIL[@]} stage(s) failed. Fix before declaring done."
  exit 1
fi
echo "GATE PASSED: no regressions detected."
exit 0
