---
name: review-panel
description: "Delegate a code change to a panel of exactly four reviewer subagents and synthesize their findings into one report. Always uses the engineer, architect, and code-simplifier subagents, then selects a fourth specialist reviewer (blink-layout-reviewer, blink-reviewer, wpt-expert, ui-ux-engineer, backend-expert, or the built-in security-review) based on the nature of the change. Use when the user asks for a 'review panel', 'panel review', 'review with multiple reviewers', 'multi-agent review', 'get a panel to review my change', 'review my CL/PR with multiple agents', or supplies a Gerrit CL URL or GitHub PR URL (or asks to review local changes) and wants more than a single reviewer."
---

# Review Panel

Review a code change with a panel of **exactly four** reviewer subagents and merge their feedback into one report.

- **engineer** — always
- **architect** — always
- **code-simplifier** — always
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

Capture the change objective from the user's request, PR body, or CL description.
Use it to define the review boundary. If the objective is unavailable or ambiguous,
ask the user to clarify it before spawning the panel.

## Step 2: Always-on reviewers

Spawn **engineer**, **architect**, and **code-simplifier** every time.

- **engineer** — correctness, bugs, edge cases, memory/thread safety, conventions, test coverage.
- **architect** — design, abstractions, coupling, API surface, long-term maintainability, tradeoffs.
- **code-simplifier** — behavior-preserving reductions in complexity, nesting, duplication, indirection, and unclear control or data flow.

## Step 3: Select the fourth reviewer

Inspect the changed file paths and the kind of change. Pick the **first** match top-to-bottom:

| Change signal | Fourth reviewer |
|---|---|
| Security-sensitive: auth, crypto, IPC, sandbox, deserialization, parsing untrusted input, URL/permission/origin checks | `security-review` (built-in) |
| Blink layout: `third_party/blink/renderer/core/layout/**`, esp. grid, masonry, flex, multicol, fragmentation, gap decorations | `blink-layout-reviewer` |
| Other Blink renderer: paint, DOM, CSS/style, SVG, bindings under `third_party/blink/renderer/**` (non-layout) | `blink-reviewer` |
| Tests: `third_party/blink/web_tests/**`, `**/wpt/**`, WPT/interop, CSS spec conformance | `wpt-expert` |
| Frontend UI: React/HTML/CSS app code, theming, responsive layout, accessibility, animations | `ui-ux-engineer` |
| Node.js backend: server, SSE/streaming, API design, process lifecycle, performance hardening | `backend-expert` |
| None of the above | `security-review` (built-in) as a safe default |

State which fourth reviewer you chose and the one-line reason before spawning.

## Step 4: Spawn the panel in parallel

Issue all four `Task` calls in a **single response** (one per `agent_type`). Give each the **full diff** plus its role focus. Reuse this template, swapping the focus block:

### Allocate models

Set `model` explicitly on every `Task` call. Use GPT-5.6 Sol
(`gpt-5.6-sol`) as the baseline, with optional GPT-6 Astra
(`gpt-6-astra`) and Opus (`claude-opus-5`) reviewers:

- Use **at most one Opus reviewer** across the four reviewers, including
  user-specified model mixes or reviewer-to-model mappings.
- Use **at most one Astra reviewer** across the four reviewers, including
  user-specified model mixes or reviewer-to-model mappings.
- Use Sol for every remaining reviewer.
- Default to **2 Sol + 1 Astra + 1 Opus** for all change types.
- Follow user-specified model mixes or mappings only when they meet both caps.
  If a request exceeds either cap, ask the user for a compliant selection
  before spawning any reviewers.
- Assign models by relevance to the change. Do not permanently bind a model to
  a reviewer role. Assign Opus and Astra to the perspectives most central to
  the change, and assign Sol to all other roles.

Before spawning, state the selected model composition and each
reviewer-to-model assignment.

```
## Change under review
Source: [Gerrit CL / GitHub PR / local diff] [identifier]

## Objective
[user request, PR body, or CL description]

## Diff
```diff
[full diff]
```

## Your role: [engineer | architect | code-simplifier | <specialist>]
[role-specific focus from Step 2/3]

## Review scope
Review only whether this change correctly and safely implements the stated objective.

You may inspect surrounding code for context, but report a finding only when it:
- Is introduced, exposed, or materially worsened by this change.
- Directly prevents the stated objective.
- Is necessary to understand a concrete failure in the changed behavior.

Do not report unrelated pre-existing defects, broad refactoring opportunities,
general cleanup, or improvements outside the requested change.

Use this counterfactual test: if reverting the change leaves the concern materially
unchanged, exclude it unless the change newly depends on or exposes that concern.

Do not invent requirements that are absent from the stated objective.

## Output
For each finding: Severity (Critical/Warning/Suggestion/Nit), Location (file:line), Issue, Suggested fix.
End with a verdict: LGTM / LGTM with nits / Needs changes.
```

When reviewing Chromium code and `~/.copilot/repo-knowledge/src/` exists, pass
the relevant `sections/*.md` and matching `focus-areas/*` files to engineer,
architect, and code-simplifier so they review against project conventions.

## Step 5: Synthesize

Merge the four reports into one. The final report must use this format every
time, even when the user does not specify an output format:

1. **De-duplicate** findings raised by multiple reviewers (note the agreement — it raises confidence).
2. **Enforce the review boundary** before including a finding. Confirm that it is
   causally related to the change and relevant to the stated objective. Exclude
   scope-creep findings even when multiple reviewers raised them.
3. **Order by severity**: Critical → Warning → Suggestion → Nit.
4. Number findings sequentially across all severities.
5. Present findings in one Markdown table with exactly these columns:

   | # | Severity | Reviewer(s) | Location | Concern and detailed explanation | Suggested fix | Panel synthesizer's take |
   |---:|---|---|---|---|---|---|

6. In **Reviewer(s)**, name every panel member that raised the de-duplicated
   finding.
7. In **Concern and detailed explanation**, explain the concrete failure mode,
   why it matters, and any important example or edge case. Do not merely repeat
   the reviewer's one-line issue.
8. In **Panel synthesizer's take**, independently assess the finding: agree,
   partially agree, disagree, or mark it uncertain, with a concise rationale
   and priority.
9. After the table, note reviewer disagreements explicitly. If there are none,
   say so.
10. End with an **overall verdict** and the single most important next action.
