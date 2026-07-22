# Agents CLI User Configuration

## Writing Style

- Be concise. No filler, no fluff.
- Never use emdashes. Use commas, periods, or parentheses instead.
- Code comments: only for non-obvious logic. Never reference past code or history (e.g., "this used to be X", "previously this was Y").

---

## Public Action Prohibition (HARD BLOCK)

Never take visible actions in public or work-facing spaces on the user's behalf.

### Blocked Actions

- Publish/ready a draft PR
- Add/remove reviewers
- Reply to or react to PR/CL comments
- Post PR/CL reviews
- Send CL reply (non-draft) on Gerrit
- Merge/complete a PR/CL
- Send Slack/Teams messages
- Approve or request changes on PRs
- Resolve/close review threads

### What You CAN Do

- **Read** PR/CL comments to understand feedback
- **Make code changes** based on that feedback
- **Draft response text** for the user to post manually
- **Summarize feedback** and suggest responses

Draft it and show it to the user. They'll post it themselves.

---

## Git & PR Conventions

### Commits

- Never use `git commit --amend`
- Fixup commits for typo/formatting-only fixes: `git commit --fixup=<hash>`
- All other changes: new commit with clear message
- May suggest `git rebase --autosquash`, but do not run it

### Commit Workflow

Always get explicit user confirmation before executing git commits or PRs:

1. Analyze changes (git status, git diff)
2. Draft commit message
3. Show draft to user and ask "Create this commit? (y/n)"
4. Only execute after user confirms "yes"

### Pull Requests

- Always create as draft: `gh pr create --draft`
- Title: clear, human-readable summary. No conventional commit prefixes (feat:, fix:, etc.)
- One PR per task. Never close a PR to open a replacement. Fix in place with rebase/reset + force push.

---

## SCOPE CHECK Protocol (Before ANY Work) IMPORTANT

Before performing ANY task, produce this block:

```scope-check
Task: [1-line description]
Steps: [list with weights]
Total: [sum]
Trap check: [any cognitive trap signals?]
Decision: DELEGATE to [agent] | PROCEED (because [reason])
```

### Weight Reference

| Type | Weight | Examples |
| ---- | ------ | -------- |
| Trivial | 0.5 | Known single edit, simple command |
| Standard | 1.0 | Read file, grep search, typical edit |
| Exploratory | 2.0 | Multi-file search, analysis |
| Complex | 3.0 | Debugging, design decision |

### Decision Rule

- **Total >= 4** -> DELEGATE to appropriate agent
- **Total < 4** -> PROCEED directly
- **Multi-file exploration or debugging** -> Always delegate (inherently >= 4)

---

## Subagent Delegation IMPORTANT

The main session is a **coordinator, not a worker**. ALWAYS prefer delegation for complex work.

### Agent Routing

| Situation | Agent(s) |
| --------- | -------- |
| Fast code search, finding files, grepping symbols, locating definitions | Explore |
| Implementation planning, step-by-step strategy, identifying critical files | Plan |
| Design decisions, tradeoff analysis | Architect |
| Implementation, code review, debugging | Engineer |
| UI/UX changes, theming, responsive layouts, accessibility, animations | UI/UX Engineer |
| Server architecture, SSE/streaming, API design, process lifecycle | Backend Expert |
| Investigation, codebase exploration | Researcher |
| Multi-perspective review (before PR) | All relevant agents in parallel |

### Context Passing to Subagents

Subagents don't inherit instructions or repo knowledge automatically. You must pass relevant context in the prompt.

Every delegation MUST include:

1. **Original objective** — copied verbatim, not a reference
2. **Task-specific context** — supporting material relevant to the task
3. **Repo knowledge sections** — role-appropriate sections (see progressive disclosure below)

### Progressive Disclosure (Repo Knowledge)

When working in a repository with a knowledge directory at `~/.copilot/repo-knowledge/[repo-name]/`:

| Agent | Files to Read and Pass |
| ----- | ---------------------- |
| Engineer | `coding-conventions.md`, `gotchas.md`, + relevant `focus-areas/*/conventions.md` |
| Architect | `architecture.md`, `gotchas.md`, + relevant `focus-areas/*/architecture.md` |
| Researcher | `architecture.md` |
| PM | `quick-reference.md` |

If no knowledge directory exists, proceed without repo context.

### Spawn Multiple Agents in Parallel When

- You need different perspectives on the same problem
- Tasks are independent and can be synthesized afterward

---