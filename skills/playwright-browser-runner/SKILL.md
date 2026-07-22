---
name: playwright-browser-runner
description: Resolve and launch a Playwright browser session and capture deterministic screenshots. Use when asked to run/use Playwright, automate or screenshot a page, launch a local Chromium source build (out/* binary), launch an installed Edge channel (Stable/Beta/Dev/Canary), resolve Playwright when it isn't a project dependency, or connect over CDP after a pipe-launch failure. Covers only browser/session mechanics (package resolution, browser selection, launch, capture) - not WPT test/ref authoring or domain knowledge (see wpt-reftest-author for that).
---

# Playwright Browser Runner

Resolve a working Playwright install, pick the right browser binary, launch it, and capture a
deterministic screenshot - without ever installing anything silently.

## Workflow

1. **Resolve Playwright**: run `scripts/resolve-playwright.cjs [--cwd <dir>]`. It tries, in order:
   project dependency -> global npm package -> persistent npx cache (newest version) -> `/tmp/node_modules`
   (explicitly ephemeral). If none resolve, it exits non-zero with diagnostics - **stop and ask the
   user before installing anything**; never install silently. See `references/playwright-resolution.md`
   for the full priority table and verified environment facts.

2. **Pick the browser**:
   - **Local Chromium source build**: run `scripts/find-browser.cjs --src <chromium-src>` (or
     `--out <dir>` to restrict to one build, or `--executable <path>` if the user already gave one).
     It ranks `out/*` platform binaries by mtime and prints every candidate plus the selected path
     and reason - never picks silently when there's ambiguity. See
     `references/browser-selection.md` for per-platform binary paths.
   - **Installed Edge channel**: prefer Playwright's native `channel` launch option
     (`msedge`, `msedge-beta`, `msedge-dev`, `msedge-canary`) over manually probing for an
     executable. Only fall back to manual path probing if the native channel launch fails.

3. **Render and capture**: run `scripts/render-page.cjs <url-or-path> [options]`. It resolves
   Playwright itself (step 1), launches the chosen browser (step 2), and captures a screenshot with
   deterministic settling. See `--help` for all options (executable/channel, viewport/dSF, repeatable
   `--flag` and `--feature`, screenshot path).

   For a custom `--executable`, it tries a normal launch first. If that fails (observed as a SIGTRAP
   crash on some local Chromium builds), it falls back automatically: spawn with
   `--remote-debugging-port=0` and a fresh profile, read `DevToolsActivePort`, and attach with
   `connectOverCDP()`. See `references/cdp-fallback.md` for the exact mechanics.

4. **Always report**: the chosen Playwright source/version and the chosen browser executable/channel,
   exactly as printed in each script's JSON output. Don't let this get lost in a summary.

## Deterministic capture defaults

When a screenshot is requested, `render-page.cjs` applies these defaults unless overridden:

- Viewport 800x600, device scale factor 1
- Wait for `document.fonts.ready`
- Two nested `requestAnimationFrame` calls before capture
- Animations and transitions disabled via injected CSS
- Screenshot is of the viewport only (not full-page)

## Security boundaries

- **CAN**: resolve an already-installed Playwright, launch local/installed browsers, capture
  screenshots to a caller-specified path, clean up temporary profiles/processes it created.
- **CANNOT**: install Playwright or any package, download browser binaries, upload screenshots or
  page content anywhere.
- **MUST**: leave no orphaned browser processes or temporary profile directories behind - close the
  browser and remove any profile directory this skill created, even on failure.
