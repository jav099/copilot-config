# CDP Fallback for Custom Executables

## When this triggers

Launching a custom `--executable` normally uses Playwright's pipe transport
(`chromium.launch({ executablePath, args })`). Some local Chromium builds crash on the pipe
transport (observed as a SIGTRAP). `render-page.cjs` tries the normal launch first and only falls
back if that throws - most local builds launch fine on the first try.

## Fallback mechanics

1. Create a fresh temporary profile directory (`fs.mkdtempSync`).
2. Spawn the executable directly (not through Playwright) with:
   ```
   --remote-debugging-port=0 --user-data-dir=<fresh-profile-dir>
   ```
   Spawn it **detached** (own process group) - this matters for cleanup (see below).
3. Poll the profile directory for a `DevToolsActivePort` file. Its first line is the port number the
   browser actually bound (port 0 means "pick any free port").
4. Attach with `playwright.chromium.connectOverCDP('http://localhost:<port>')`.
5. Always open a **new** page via `context.newPage()` rather than reusing the browser's existing
   default page/context. A freshly spawned Chrome auto-navigates its first tab to
   `chrome://new-tab-page`, which races with an immediate `page.goto()` on that same page and can
   abort the navigation.

## Cleanup gotchas (both required - discovered by testing this fallback directly)

- **`browser.close()` on a `connectOverCDP()` session does not terminate the underlying process** -
  it only disconnects. The process (and its renderer/GPU/network helper subprocesses) must be
  killed explicitly.
- **Killing only the top-level Chrome process leaves helper processes running**, which keep files in
  the profile directory open and race a subsequent `rm -rf` of that directory (`ENOTEMPTY`). Spawn
  with `detached: true` so the browser gets its own process group, then kill the whole group with
  `process.kill(-child.pid, 'SIGKILL')` (POSIX) or `child.kill()` (Windows, no process-group signal).
  Retry the directory removal a few times with a short delay before giving up.

`render-page.cjs` implements both of the above; see `killProcessTree()` and
`removeDirWithRetry()` if adapting this pattern elsewhere.
