---
name: update-knowledge
description: "Update an existing knowledge base (KB) so it matches its source of truth, using a multi-agent audit-and-verify pipeline. A researcher audits the KB against the implementation and writes proposed edits to a tracking file; an architect and an engineer independently corroborate each edit; a third specialist agent tie-breaks any disagreement; only corroborated edits are applied to the KB. Use when the user asks to 'update knowledge', 'update-knowledge', 'refresh a knowledge base', 'update repo-knowledge', 'check if the docs/KB are stale', 'audit a knowledge base against the code', 'sync docs with the implementation', or to orchestrate KB maintenance with several reviewing agents that must agree before changes land. Works for Chromium repo-knowledge focus areas and for any arbitrary markdown KB or documentation set."
---

# Update Knowledge

Refresh a knowledge base by **proposing edits with one agent and ratifying them with others** — nothing changes the KB until reviewers agree. This catches stale, wrong, or missing content while keeping a verifiable trail.

Pipeline: **researcher proposes → architect + engineer corroborate (in parallel) → tie-breaker resolves disagreements → apply only ratified edits**.

Each agent is stateless: pass the full context (tracking-file path, KB paths, source-of-truth paths) in every prompt. Reviewers must **independently verify against the source of truth**, never rubber-stamp the researcher.

## Step 1: Scope the run

1. **Identify the KB** — the directory or file set to update (e.g. `~/.copilot/repo-knowledge/<repo>/focus-areas/<area>/`, or any docs folder). Read every file so you can brief agents accurately.
2. **Identify the source of truth** — what the KB documents (the codebase/implementation, an API, a spec). This is what every claim is checked against.
3. **Gauge staleness** — if the KB records a "Generated"/"Updated" date, list changes to the source since then (e.g. `git --no-pager log --since=<date> --oneline -- <paths>`) to focus the audit.
4. **Make a tracking directory** — the session `files/` folder if available (`~/.copilot/session-state/<id>/files/`), else a temp dir. All artifacts below live here.

If the KB or its source of truth is ambiguous, ask the user before spawning agents.

## Step 2: Researcher audit (delegate)

Spawn the **researcher** agent. Its job: compare every factual claim in the KB against the source of truth and write proposed edits to `kb-audit.md`. The prompt must include: the KB file paths, the source-of-truth paths, the staleness window, and the **exact** output format below. Tell it to cite `file:line` evidence for every claim, prefer many small precise edits over a few vague ones, make each "proposed new text" drop-in ready, and NOT edit the KB itself.

`kb-audit.md` format (the contract the corroborators rely on):

```
# KB Audit — Proposed Edits
Auditor: researcher   Date: <date>   Source-of-truth HEAD: <sha or version>

## Summary
<how stale, edit count, severity spread>

## Proposed Edits
### E1 — <short title>
- KB file / section: <file> > <heading>
- Category: factual-error | stale | missing | minor
- Severity: high | medium | low
- Current KB text: "<exact quote, or 'N/A — missing'>"
- Problem: <what is wrong / outdated / absent>
- Evidence: <source file:line(s), optionally commit/version>
- Proposed new text: "<drop-in replacement/addition>"
### E2 — ...  (number E1..En, no gaps)

## Items verified accurate (no edit needed)
<bullets of notable claims confirmed still correct, with citations>
```

## Step 3: Corroborate in parallel (delegate)

Spawn **architect** and **engineer** in a **single response** (parallel). Give each: the `kb-audit.md` path, the KB paths, and the source-of-truth paths. Each independently re-verifies every edit and writes its own verdict file.

- **engineer** → `engineer-verdict.md` — implementation accuracy: exact symbol/method/enum/field names, signatures, file paths, config/flag values, and whether each "proposed new text" is literally correct and drop-in. Run real checks (grep symbols, count files, read config) — do not infer.
- **architect** → `architect-verdict.md` — design/structure: whether reframings capture intent (not just tokens), whether "missing" additions are significant vs noise, internal consistency, and whether the change is characterized correctly.

Each verdict file gives one verdict per item from exactly: **AGREE** · **AGREE-WITH-NUANCE** (core right, needs a concrete tweak — supply it) · **DISAGREE** (claim/text wrong — explain with evidence). Per-item block:

```
### E1 — <title>
- Verdict: AGREE | AGREE-WITH-NUANCE | DISAGREE
- Evidence checked: <symbols/files/lines/counts verified>
- Notes / required tweak: <exact correction if not plain AGREE>
```

Also instruct both to flag any "Items verified accurate" entry they believe is actually wrong (becomes a new candidate edit).

## Step 4: Adjudicate, tie-break disagreements

Compare the two verdicts item-by-item:

| Architect | Engineer | Action |
|---|---|---|
| AGREE | AGREE | Apply the researcher's proposed text |
| NUANCE | NUANCE (same tweak) | Apply the agreed tweak |
| DISAGREE | DISAGREE | Discard the edit — do not change the KB |
| Any mismatch (AGREE vs NUANCE/DISAGREE, NUANCE vs DISAGREE, or two different NUANCEs) | | **Tie-break** this item |

For each disputed item, spawn **one third agent** to adjudicate. It must independently check the source of truth and decide the final text — it may side with either reviewer, write a hybrid, or overturn both. Write decisions to `tiebreak.md` (final drop-in text per item). Batch all disputed items into one tie-breaker when practical.

Pick the tie-breaker by the KB's domain (a third, distinct specialist — first match top-to-bottom):

| KB / source-of-truth domain | Tie-breaker |
|---|---|
| Blink layout: grid, masonry, flex, multicol, fragmentation, gap decorations | `blink-layout-reviewer` |
| Other Blink renderer: paint, DOM, CSS/style, SVG, bindings | `blink-reviewer` |
| Web platform tests / WPT / interop / CSS conformance | `wpt-expert` |
| Frontend UI: React/HTML/CSS, theming, accessibility, animations | `ui-ux-engineer` |
| Node.js backend: server, streaming, API design, process lifecycle | `backend-expert` |
| Security-sensitive: auth, crypto, IPC, sandbox, untrusted input | `security-review` (built-in) |
| Generic / none of the above | `rubber-duck` (built-in) |

## Step 5: Apply and verify

Apply only ratified text: unanimous AGREE items, agreed NUANCE tweaks, and tie-broken decisions. Discard both-DISAGREE items.

- Unanimous items are independent of disputed ones — apply them while the tie-breaker runs.
- Use precise string replacements; match each "Current KB text" exactly. Keep the KB's existing table/prose style.
- **Verify**: grep that removed/stale tokens are gone and new tokens are present across the edited files.
- If the KB carries a "Generated"/"Updated" date or version, update it (or ask the user) to reflect the refresh.

Keep the tracking files (`kb-audit.md`, `*-verdict.md`, `tiebreak.md`) as provenance. Report what changed: edits applied, items discarded, tie-break outcomes, and anything the reviewers flagged that the user should decide on.

## Notes

- Track the run with a todo list / SQL when there are many edits, so status is visible across phases.
- For Chromium KBs, pass the relevant `~/.copilot/repo-knowledge/<repo>/` sections to the agents so they review against project conventions.
- Default to delegating the audit and corroboration — that independence is the point. Doing the audit yourself defeats the cross-check.
