# Javier's Personal Instructions

- Never run presubmit unless Javier explicitly requests it.
- Agents must not reply to comments or communicate with other people on Javier's
  behalf unless Javier explicitly requests the action or explicitly confirms it.
- Use `out/debug_full_x64` as the build directory unless Javier explicitly
  specifies another directory.

- When writing web tests (WPT tests) do NOT add comments to the HTML.

- Avoid scope creep. If a change is not directly related to the task at hand, do not make it.
  If you think a change is necessary, ask the user first.

## Chromium Source Code

This is the Chromium open-source browser engine codebase.

### Repo Knowledge Bases

Curated, code-grounded knowledge for specific Blink areas lives under
`~/.copilot/repo-knowledge/src/` (local, untracked, not part of the Chromium tree). Consult it
before diving into these areas, and pass the relevant files to sub-agents.

- **Focus areas:** `~/.copilot/repo-knowledge/src/focus-areas/<area>/`. Each contains
  `_index.md` (read first), `architecture.md`, `conventions.md`, `testing.md`, and `gotchas.md`:
  - `gap-decorations/`: CSS Gap Decorations (column/row rules) for grid, flex, and multicol.
  - `grid-lanes/`: CSS Grid Level 3 masonry layout (in-tree name "grid-lanes").
- **Base sections:** `~/.copilot/repo-knowledge/src/sections/`: repo-wide `architecture.md`,
  `coding-conventions.md`, `gotchas.md`, `testing.md`, and `quick-reference.md`.

### Building and Testing

Use the `edge-developer-core` plugin skills:

- **`/edge-developer-core:build`**: Build Chromium targets with autoninja.
- **`/edge-developer-core:test`**: Run gtest (unit/browser) and Blink web tests.

Other useful skills are `/edge-developer-core:iterate` (build and test loop) and
`/edge-developer-core:gncheck` (GN dependency checks).

### Debugging with Playwright

You can use the local Chromium build at `out/debug_full_x64` with Playwright to
take screenshots, open HTML files, and inspect rendering. Playwright is
available through `npx` (installed at `/tmp/node_modules`).

```js
const { chromium } = require('playwright');

const browser = await chromium.launch({
  executablePath: 'out/debug_full_x64/Chromium.app/Contents/MacOS/Chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});
const page = await browser.newPage();

// Open a local HTML file
await page.goto('file:///Users/javiercon/chromium/src/path/to/file.html');

// Take a screenshot
await page.screenshot({ path: '/tmp/screenshot.png' });

await browser.close();
```

Run scripts with `cd /tmp && node script.js`. If Playwright is not installed,
run `cd /tmp && npm install playwright` first.