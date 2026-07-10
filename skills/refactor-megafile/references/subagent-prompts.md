# Subagent Prompt Templates

Copy-paste templates for the subagents this skill spawns. Agents are
**stateless** — every prompt must carry complete context (objective, file,
conventions, constraints). Fill the `{{...}}` placeholders before spawning.

Shared placeholders:

- `{{REPO_ROOT}}` — absolute path to the repo root (e.g. `/home/<user>/phoenix`).
- `{{FILE}}` — path to the megafile being refactored (e.g. `server/src/routes/machines.ts`).
- `{{LINES}}` — current line count.
- `{{TIER}}` / `{{APPROACH}}` — tier + recommended split from
  `investigations/megafile-refactoring-audit.md` (if present).
- `{{IMPORTERS}}` — number of importing files (blast radius).
- `{{SIZE_GOAL}}` — constant size objective for every spawn: "Reduce each
  resulting file's line count as much as a clean, single-responsibility split
  allows — smaller is better, with NO target line count to stop at. The repo's
  AGENTS.md size limits are only a baseline to comfortably clear, never the goal."
- `{{REFACTOR_PLAN}}` — the architect's decomposition plan (output of template #1),
  pasted verbatim into the plan reviewers, the implementing engineer, and the
  implementation architect reviewer.
- `{{PLAN_REVIEW_FINDINGS}}` — combined engineer + architect plan-review findings,
  pasted into template #1 when revising the plan.

---

## Table of contents

- [1. Architect planner / reviser (Task: architect, sync)](#1-architect-planner--reviser)
- [2. Plan-review engineer (Task: engineer, background, parallel)](#2-plan-review-engineer)
- [3. Plan-review architect (Task: architect, background, parallel)](#3-plan-review-architect)
- [4. Refactor engineer (Task: engineer, sync)](#4-refactor-engineer)
- [5. Review engineer (Task: engineer, background, parallel)](#5-review-engineer)
- [6. Review architect (Task: architect, background, parallel)](#6-review-architect)
- [7. Address-findings engineer (Task: engineer, sync)](#7-address-findings-engineer)

---

## 1. Architect planner / reviser

Spawn **one** `architect` agent (sync) for both the initial plan and its revision
after plan review. It designs the decomposition; it writes NO code.

```
You are designing the refactor plan for a megafile in the Dragon monorepo (repo
root: {{REPO_ROOT}}). DESIGN ONLY — do not write or modify any code, do not
create files. Output a plan as text.

## Objective
Produce a concrete, step-by-step plan to split `{{FILE}}` ({{LINES}} lines) into
focused, single-responsibility modules, WITHOUT changing behavior or the public
API. {{SIZE_GOAL}}

## Gather context first
- Read `{{FILE}}` in full. Map its responsibilities, exported symbols
  (`grep -nE '^export ' {{FILE}}`), and internal coupling (shared state, helper
  call graphs).
- Read AGENTS.md and the nearest `.kb/sections/` files for module-boundary rules:
  `chats/` must not import `server/`/`client/`; cross-package code → `shared/*`;
  route files stay thin (logic in `engine/`/`lib/`).
- Audit hint (use judgment): Tier {{TIER}}. {{APPROACH}} Blast radius:
  {{IMPORTERS}} importing files.

## The plan must specify
1. Target file layout — each new module's path and its single responsibility.
2. For each new module, which symbols/functions move into it (by name).
3. Re-export strategy — how `{{FILE}}` stays a thin shell so NO import site
   changes (list the exact symbols it must re-export).
4. Extraction ORDER — sequenced so the verification gate can stay green between
   steps (pure helpers first, then dependents, boundary/entry last).
5. Risks and invariants to preserve (ordering, side effects, init timing) and any
   spot where behavior could subtly drift.
6. An estimated line count per resulting file — driven as low as a cohesive split
   allows. There is NO target number and no floor to stop at; smaller is better as
   long as each module stays cohesive.

## Revising? (only when plan-review findings are provided below)
If the findings block below is non-empty, this is a REVISION: address every
[BLOCKING] finding, apply or briefly justify skipping each [non-blocking] one,
and output the COMPLETE updated plan (not a diff). If the block is empty, ignore
this section and produce the initial plan.

PLAN-REVIEW FINDINGS:
{{PLAN_REVIEW_FINDINGS}}

## Output
A numbered, unambiguous plan an engineer can implement directly without redesign.
Do NOT write code or create files — text only.
```

---

## 2. Plan-review engineer

Spawn in **parallel** with the plan-review architect (both `background`).
Read-only — it critiques the PLAN; no code exists yet.

```
You are reviewing a PROPOSED refactor plan (no code written yet) in the Dragon
monorepo (repo root: {{REPO_ROOT}}). REVIEW ONLY — do not write code or modify
files.

## The plan under review
A planned refactor of `{{FILE}}` ({{LINES}} lines) into smaller modules. The
architect's plan:

{{REFACTOR_PLAN}}

## Review for (implementation feasibility)
1. IMPLEMENTABILITY: can each step be executed as written? Flag moves that won't
   compile — circular imports between the proposed modules, shared closure/module
   state that can't be cleanly split, private/type access that breaks when
   relocated.
2. BEHAVIOR RISK: any step that, implemented literally, would change behavior,
   evaluation order, side effects, or init timing.
3. API PRESERVATION: does the re-export plan keep EVERY current export so no
   import site changes? List anything missing from the re-export set.
4. EXTRACTION ORDER: does the sequence keep the build + tests green between steps,
   or does an early step leave the tree broken?
5. SIZE REDUCTION: does the plan drive every resulting file's line count down as
   far as a cohesive split reasonably allows, or does it leave oversized modules
   that should be split further? (No target number — smaller is better while
   cohesion holds.)

Do NOT bikeshed module names. Flag only what would make the implementation fail,
regress, or miss the goal.

## Output
A numbered list of findings, each tagged [BLOCKING] or [non-blocking], with the
plan step involved and a concrete fix. End with:
VERDICT: APPROVE  or  VERDICT: REVISE.
```

---

## 3. Plan-review architect

Spawn in **parallel** with the plan-review engineer (both `background`).
Read-only — it critiques the PLAN; no code exists yet.

```
You are reviewing the ARCHITECTURE of a PROPOSED refactor plan (no code written
yet) in the Dragon monorepo (repo root: {{REPO_ROOT}}). REVIEW ONLY.

## The plan under review
A planned refactor of `{{FILE}}` ({{LINES}} lines) into smaller modules. The
architect's plan:

{{REFACTOR_PLAN}}

## Review for (architecture)
1. DECOMPOSITION SOUNDNESS: are the proposed boundaries cohesive (single
   responsibility) and low-coupling, or arbitrary line-count cuts through
   tightly-coupled logic? Will they survive the next feature change?
2. MODULE-BOUNDARY RULES: does the plan respect repo boundaries — `chats/` must
   not import `server/`/`client/`; cross-package code → `shared/*` (single source
   of truth); route files stay thin (logic in `engine/`/`lib/`)?
3. PUBLIC SURFACE: does the plan keep the public API minimal, or does the
   re-export shell leak internals that were previously private?
4. DIRECTIONALITY: would the proposed module graph introduce cycles or layering
   violations?
5. BETTER SEAM: is there a materially better decomposition the plan misses? If
   so, describe it concretely.

## Output
A numbered list of findings, each tagged [BLOCKING] or [non-blocking], with a
concrete recommendation. End with: VERDICT: APPROVE  or  VERDICT: REVISE.
```

---

## 4. Refactor engineer

Spawn **one** `engineer` agent (sync). It implements the revised plan (template #1
output, after plan review) — it does not redesign.

```
You are refactoring a megafile in the Dragon monorepo (repo root: {{REPO_ROOT}}).
This is a pure structural refactor: NO behavior changes, NO new features, NO API
changes visible to callers.

## Objective
Implement the architect's plan below to split `{{FILE}}` ({{LINES}} lines) into
focused, single-responsibility modules, without changing behavior. {{SIZE_GOAL}}

## Plan to implement (from the architect — follow it exactly)
{{REFACTOR_PLAN}}

If any step is unworkable or would force a behavior or API change, STOP and report
back rather than silently diverging from the plan.

## Hard constraints
1. PRESERVE THE PUBLIC API. Keep every exported symbol's name, signature, and
   semantics identical. If callers import from `{{FILE}}`, keep it as a thin
   re-export shell (or barrel) so no import site has to change. Verify with:
   `grep -rln "from ['\"].*<basename>['\"]"` before and after.
2. PRESERVE BEHAVIOR. No logic changes, no "while I'm here" fixes, no dependency
   bumps. Move code, don't rewrite it.
3. Respect repo conventions: read AGENTS.md and the nearest `.kb/sections/`
   files. Cross-package code belongs in `shared/*`; `chats/` must not import
   `server/` or `client/`; route files stay thin (logic in `engine/`/`lib/`).
4. Every new module needs the right test wiring; existing tests must keep
   passing unchanged. Do NOT weaken or delete tests to make them pass.
5. Reduce, don't relocate — each NEW file should be as small as a cohesive split
   allows; don't just move the bulk into one big new module. No target number, but
   smaller is better.

## When done
Report: files created/moved, line count of each resulting file, the exact list
of exported symbols you preserved, and confirmation that no import site changed.
Do NOT commit or open a PR.
```

---

## 5. Review engineer

Spawn in **parallel** with the architect (both `background`). Read-only.

```
You are reviewing a just-completed structural refactor in the Dragon monorepo
(repo root: {{REPO_ROOT}}). REVIEW ONLY — do not modify code.

## What changed
`{{FILE}}` ({{LINES}} lines originally) was split into focused, single-
responsibility modules to reduce its size as much as a cohesive split allows. It
must be a behavior-preserving, API-preserving
refactor. Inspect the working-tree diff: `git diff` (and `git status` for new
files).

## Review for (code-level, high signal only)
1. BEHAVIOR DRIFT: any moved code whose logic, control flow, ordering, or error
   handling changed. Flag anything that isn't a pure move.
2. API BREAKAGE: an exported symbol renamed/removed/re-signatured, or an import
   site that now has to change. Confirm the re-export shell is complete.
3. INCOMPLETE EXTRACTION: dead code, duplicated logic, dangling references,
   broken imports, or oversized modules that should have been split further.
4. TEST INTEGRITY: tests weakened, skipped, or deleted to pass; missing coverage
   for newly-public module seams.

Do NOT comment on style, naming preferences, or anything Prettier/ESLint owns.
Only surface issues that are bugs, regressions, or incomplete extractions.

## Output
A numbered list of findings, each tagged [BLOCKING] or [non-blocking], with
file:line and a concrete fix. If the refactor is clean, say "No blocking
findings." End with: VERDICT: APPROVE  or  VERDICT: CHANGES REQUESTED.
```

---

## 6. Review architect

Spawn in **parallel** with the review engineer (both `background`). Read-only.

```
You are reviewing the ARCHITECTURE of a just-completed megafile split in the
Dragon monorepo (repo root: {{REPO_ROOT}}). REVIEW ONLY — do not modify code.

## What changed
`{{FILE}}` ({{LINES}} lines) was decomposed into multiple modules per the
architect's plan below. Inspect the diff: `git diff` plus `git status` for new
files.

## The plan the engineer was told to implement
{{REFACTOR_PLAN}}

## Review for (architecture-level)
1. DECOMPOSITION SOUNDNESS: are the new module boundaries cohesive (single
   responsibility) and low-coupling, or arbitrary line-count cuts that split
   tightly-coupled logic? Would the boundaries survive the next feature change?
2. MODULE-BOUNDARY RULES: `chats/` must not import `server/`/`client/`;
   cross-package code must live in `shared/*` (single source of truth, no
   duplication); route files stay thin (business logic in `engine/`/`lib/`).
3. PUBLIC SURFACE: is the minimal API exported, or did the split leak internals
   that were previously private? Is the re-export shell the right seam?
4. DIRECTIONALITY: any new circular dependencies or layering violations
   introduced between the extracted modules?
5. PLAN CONFORMANCE: does the implementation follow the plan above (module
   layout, re-export seam, extraction order)? Flag unplanned deviations and judge
   whether each is an improvement or a regression.

Do NOT restate code-level nits (the engineer reviewer owns those). Focus on
structure and boundaries.

## Output
A numbered list of findings, each tagged [BLOCKING] or [non-blocking], with the
file/boundary involved and a concrete recommendation. End with:
VERDICT: APPROVE  or  VERDICT: CHANGES REQUESTED.
```

---

## 7. Address-findings engineer

Spawn **one** `engineer` agent (sync) after collecting both reviews. A fresh
stateless instance is fine — paste the findings verbatim.

```
You are addressing review findings on an in-progress megafile refactor in the
Dragon monorepo (repo root: {{REPO_ROOT}}). Make the code changes.

## Context
`{{FILE}}` was split into focused modules (behavior- and API-preserving). Two
reviewers (an engineer and an architect) reviewed the working-tree diff. Their
findings are below.

## Findings to resolve
### Engineer review
{{ENGINEER_FINDINGS}}

### Architect review
{{ARCHITECT_FINDINGS}}

## Your task
1. Address every [BLOCKING] finding. For each [non-blocking] finding, either fix
   it or briefly justify skipping it.
2. Keep the same hard constraints as the original refactor: NO behavior change,
   NO public-API change, no weakened tests, and every resulting file reduced as
   far as a cohesive split allows (no target line count).
3. After your changes, the full verification gate must pass (the orchestrator
   re-runs `scripts/verify.sh`).

## Output
Report each finding and how you resolved it (or why you skipped it), and the
files you touched. Do NOT commit or open a PR.
```
