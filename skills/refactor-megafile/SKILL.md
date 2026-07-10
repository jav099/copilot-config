---
name: refactor-megafile
description: >-
  Orchestrates a safe, review-gated refactor of one oversized source file
  (a "megafile") into focused modules in the Dragon monorepo. An architect
  subagent designs the decomposition plan, an engineer and architect review and
  revise that plan, an engineer implements it, then an engineer AND an architect
  review the implementation in parallel, an engineer addresses their findings, and
  the full build + test gate proves no regressions. Use when asked to "refactor a
  megafile", "split this big file", "break up this file", "reduce this file's
  size", "shrink this file as much as possible", or when executing
  plans/megafile-refactoring.md.
---

# Refactor Megafile

Orchestrates a behavior-preserving split of one oversized file into focused
modules, gated by parallel multi-agent review and the repo's full CI-equivalent
test suite. This is an **orchestrator skill**: it spawns and coordinates
subagents and runs the verification gate — it does not do the refactor inline. An
architect designs the decomposition plan up front; an engineer and architect
review and revise it; an engineer then implements exactly that approved plan.

**Refactor, not rewrite.** Every step preserves the file's public API and runtime
behavior. The only goal is structure: reduce each resulting file's line count as
much as a clean, single-responsibility split allows — smaller is better, with
**no target line count to stop at** — and no functional change. The repo's
AGENTS.md size limits are merely a baseline a refactor must comfortably clear,
never the goal.

## Prerequisites

- **Target file** — the single megafile to split. If none is given, read the
  next unchecked item from `plans/megafile-refactoring.md`, or ask the user.
- **One file per invocation.** Never batch multiple megafiles into one run.
- **Roughly clean working tree** — so `git diff` reflects only this refactor.
  If there are unrelated staged/unstaged changes, note them before starting.
- **Audit context (optional)** — if `investigations/megafile-refactoring-audit.md`
  exists, read that file's row for the target to get its tier, blast radius,
  test net, and recommended split approach. Feed these into the subagent prompts.

## Workflow

Execute in order. Track the current step and the review-round counter.

1. **Establish a GREEN baseline.** Identify the file's workspace(s) (`server/`,
   `client/`, `chats/`, …) and run the gate scoped to them:
   `scripts/verify.sh <workspace ...>`. If the baseline is **red**, STOP and
   report — regressions can't be attributed to the refactor on a red baseline.
   Record the contract to preserve: current line count and the full list of
   exported symbols (`grep -nE '^export ' <file>`) plus the importer set
   (`grep -rln "from ['\"].*<basename>['\"]"`).

2. **Design the refactor plan (spawn 1 architect, sync).** Use template **#1** in
   [references/subagent-prompts.md](references/subagent-prompts.md), filling the
   placeholders from step 1 and the audit. The architect produces the target
   decomposition — which modules to create, what moves where, the re-export shell
   strategy, the extraction order, and the risks. It writes NO code. Capture its
   plan verbatim.

3. **Review the plan (spawn 1 engineer + 1 architect, both background).** Launch
   them in the **same turn** so they run concurrently. Use template **#2**
   (engineer — implementability, behavior risk, API preservation) and template
   **#3** (architect — decomposition soundness, boundaries). Both are read-only
   and critique the PLAN itself; no code exists yet. Wait for both.

4. **Revise the plan (spawn 1 architect, sync).** Re-run template **#1** in
   revision mode, pasting both plan reviewers' findings verbatim. The architect
   outputs the complete updated plan. If a reviewer raised a `[BLOCKING]` concern
   and the revision changed the plan substantially, repeat step 3 once to confirm
   (**bounded: max 2 plan-review rounds**). The approved, revised plan is what the
   engineer implements.

5. **Implement the plan (spawn 1 engineer, sync).** Use template **#4**, pasting
   the revised plan from step 4 verbatim. The engineer implements exactly that
   decomposition — it follows the plan, it does not redesign. If a step is
   unworkable, it reports back instead of diverging silently.

6. **Verify no regressions.** Run `scripts/verify.sh <workspace ...>`. If any
   gate fails, send the failures back to the implementing engineer (re-spawn with
   the error output) and repeat until the gate is **green**. **Never send a red
   build to review.**

7. **Review the implementation (spawn 1 engineer + 1 architect, both
   background).** Launch them in the **same turn** so they run concurrently. Use
   template **#5** (engineer) and template **#6** (architect, which also checks
   conformance to the plan). Both are read-only and review the working-tree diff.
   Wait for both.

8. **Decide.** Collect both verdicts:
   - Both **APPROVE** with no `[BLOCKING]` findings → go to step 10.
   - Otherwise → step 9.

9. **Address findings (spawn 1 engineer, sync), then re-verify.** Use template
   **#7**, pasting both reviewers' findings verbatim. After the engineer's
   changes, re-run step 6 (gate must go green). If the changes were material,
   repeat step 7 (re-review). **Bounded loop: max 3 review rounds.** If blocking
   findings remain after 3 rounds, stop and surface them to the user — do not
   loop forever.

10. **Final full verification.** Run the complete gate across all workspaces:
    `scripts/verify.sh` (no args). It must be green. Then confirm:
    - every resulting file is reduced as far as a cohesive split allows (no
      oversized module left behind),
    - no import site had to change (re-diff the importer grep from step 1),
    - no test was weakened, skipped, or deleted.

11. **Report and stop.** Summarize: files created/moved with line deltas, exported
    symbols preserved, reviewer findings + how each was resolved, and the final
    gate result. If executing `plans/megafile-refactoring.md`, tick the file's
    checkbox and update the progress table. **Do NOT commit or open a PR** — leave
    the changes for the user to review and commit themselves.

## The verification gate

[scripts/verify.sh](scripts/verify.sh) encodes this repo's CI-equivalent gate
(see `.github/workflows/ci.yml`): Prettier → ESLint → server typecheck →
client & chats build → workspace tests. Read its header for flags. Key points:

- `scripts/verify.sh` — full gate, all workspace tests (use for the final gate).
- `scripts/verify.sh server client` — scope tests to named workspaces (faster
  during iteration; builds + global gates still run).
- `scripts/verify.sh --fast` — Prettier + ESLint + server typecheck only; skips
  builds/tests. For quick mid-refactor checks, never as the final gate.
- The **client build** stage is the client typecheck (`tsc --noEmit` checks
  nothing on the client). The **server typecheck** stage is required because
  vitest strips types. Server tests are pinned to `--maxWorkers=4` to avoid a
  known parallelism flake.
- **Format false positives:** `format:check` can fail on untracked local
  artifacts (e.g. `.claude/worktrees/`) that CI never sees. If it fails, confirm
  the flagged paths are inside your change set; ignore pure local noise.

## Important rules

- **Preserve public API + behavior.** Keep `<file>` as a thin re-export shell if
  it has importers, so zero call sites change. No logic edits, no opportunistic
  fixes, no dependency changes.
- **Green baseline first; never review a red build.**
- **Architect designs, engineer implements.** The plan is reviewed and revised
  before any code is written. The implementing engineer then follows the approved
  plan exactly; if a step is unworkable it reports back rather than redesigning on
  the fly.
- **Subagents are stateless** — pass complete context every spawn (templates do
  this). Spawn the architect planner/reviser and the implement/address engineers
  sync; spawn each review pair (plan review, implementation review) in parallel.
- **Bounded review loop** (max 3 rounds), then escalate to the user.
- **Don't weaken tests** to make the gate pass.
- **No commits or PRs** without explicit user confirmation — this skill stops at
  a verified, unreviewed-by-human diff.

## Resources

- [references/subagent-prompts.md](references/subagent-prompts.md) — fill-in-the-
  blank prompts for the architect planner/reviser, the two plan reviewers, the
  implementing engineer, the two implementation reviewers, and the address-findings
  engineer. Read before spawning each subagent.
- [scripts/verify.sh](scripts/verify.sh) — the CI-equivalent build + test gate.
  Run after every code change and as the final no-regressions proof.
