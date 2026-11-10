# Agents CLI User Configuration

## Writing Style

- Be concise. No filler, no fluff.
- Never use emdashes. Use commas, periods, or parentheses instead.
- Use ASD-STE100 for all technical text that users can see.
- Code comments: only for non-obvious logic. Never reference past code or history (e.g., "this used to be X", "previously this was Y").

---

## Public Action Prohibition (HARD BLOCK)

Never take visible actions in public or work-facing spaces on the user's behalf WITHOUT the user's consent.

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

Draft it and show it to the user. They'll post it themselves. You are allowed to do the things above ONLY if the user explicitly asks, or you ask the user and get EXPLICIT confrmation.

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

## Subagents

The main session will often be used as an orchestrator to spawn subagents for specific tasks.

It is VERY important that when spawning subagents you background them and do not block the main session.
The main session should continue to orchestrate, answer questions, do tasks and synthesize results from subagents. We have access to several different subagents, which *can* be better for different tasks.
You should try to delegate tasks to a specific subagent if it makes sense to do so.


### Spawn Multiple Agents in Parallel When

- You need different perspectives on the same problem
- Tasks are independent and can be synthesized afterward

---