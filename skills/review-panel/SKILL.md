---
name: review-panel
description: "Delegate a code change to a panel of exactly three reviewer subagents and synthesize their findings into one report. Always uses the engineer and architect subagents, then selects a third specialist reviewer (blink-layout-reviewer, blink-reviewer, wpt-expert, ui-ux-engineer, backend-expert, or the built-in security-review) based on the nature of the change. Use when the user asks for a 'review panel', 'panel review', 'review with three reviewers', 'multi-agent review', 'get a panel to review my change', 'review my CL/PR with multiple agents', or supplies a Gerrit CL URL or GitHub PR URL (or asks to review local changes) and wants more than a single reviewer."
---

# Review Panel

Review a code change with a panel of **exactly three** reviewer subagents and merge their feedback into one report.

- **engineer** — always
- **architect** — always
- **one specialist** — chosen from the change (Step 3)

## Step 1: Get the diff

Pick the source from the argument the user passed (if any):

- **Gerrit URL** (`*chromium-review.googlesource.com*`): defer the fetch to the `gerrit-search` and `gerrit-comments` skills — pass them the CL number/URL and let them retrieve the CL diff and context. Do not reimplement Gerrit API access here.
- **GitHub PR URL or number** (`github.com/<owner>/<repo>/pull/<n>`): `gh pr diff <url-or-number>`.
- **No argument → local changes:**
  ```bash
  git diff HEAD                 # staged + unstaged
  # if empty:
  git diff origin/main...HEAD   # committed work on this branch
  ```
  If both are empty, tell the user there is nothing to review and stop.

If the diff exceeds ~5000 lines, warn the user and offer to scope the review to specific files.

## Step 2: Always-on reviewers

Spawn **engineer** and **architect** every time.

- **engineer** — correctness, bugs, edge cases, memory/thread safety, conventions, test coverage.
- **architect** — design, abstractions, coupling, API surface, long-term maintainability, tradeoffs.

## Step 3: Select the third reviewer

Inspect the changed file paths and the kind of change. Pick the **first** match top-to-bottom:

| Change signal | Third reviewer |
|---|---|
| Security-sensitive: auth, crypto, IPC, sandbox, deserialization, parsing untrusted input, URL/permission/origin checks | `security-review` (built-in) |
| Blink layout: `third_party/blink/renderer/core/layout/**`, esp. grid, masonry, flex, multicol, fragmentation, gap decorations | `blink-layout-reviewer` |
| Other Blink renderer: paint, DOM, CSS/style, SVG, bindings under `third_party/blink/renderer/**` (non-layout) | `blink-reviewer` |
| Tests: `third_party/blink/web_tests/**`, `**/wpt/**`, WPT/interop, CSS spec conformance | `wpt-expert` |
| Frontend UI: React/HTML/CSS app code, theming, responsive layout, accessibility, animations | `ui-ux-engineer` |
| Node.js backend: server, SSE/streaming, API design, process lifecycle, performance hardening | `backend-expert` |
| None of the above | `security-review` (built-in) as a safe default |

State which third reviewer you chose and the one-line reason before spawning.

## Step 4: Spawn the panel in parallel

Issue all three `Task` calls in a **single response** (one per `agent_type`). Give each the **full diff** plus its role focus. Reuse this template, swapping the focus block:

```
## Change under review
Source: [Gerrit CL / GitHub PR / local diff] [identifier]

## Diff
```diff
[full diff]
```

## Your role: [engineer | architect | <specialist>]
[role-specific focus from Step 2/3]

## Output
For each finding: Severity (Critical/Warning/Suggestion/Nit), Location (file:line), Issue, Suggested fix.
End with a verdict: LGTM / LGTM with nits / Needs changes.
```

When reviewing Chromium code and `~/.copilot/repo-knowledge/src/` exists, pass the relevant `sections/*.md` (and matching `focus-areas/*`) to engineer and architect so they review against project conventions.

## Step 5: Synthesize

Merge the three reports into one. The final report must use this format every
time, even when the user does not specify an output format:

1. **De-duplicate** findings raised by multiple reviewers (note the agreement — it raises confidence).
2. **Order by severity**: Critical → Warning → Suggestion → Nit.
3. Number findings sequentially across all severities.
4. Present findings in one Markdown table with exactly these columns:

   | # | Severity | Reviewer(s) | Location | Concern and detailed explanation | Suggested fix | Panel synthesizer's take |
   |---:|---|---|---|---|---|---|

5. In **Reviewer(s)**, name every panel member that raised the de-duplicated
   finding.
6. In **Concern and detailed explanation**, explain the concrete failure mode,
   why it matters, and any important example or edge case. Do not merely repeat
   the reviewer's one-line issue.
7. In **Panel synthesizer's take**, independently assess the finding: agree,
   partially agree, disagree, or mark it uncertain, with a concise rationale
   and priority.
8. After the table, note reviewer disagreements explicitly. If there are none,
   say so.
9. End with an **overall verdict** and the single most important next action.
