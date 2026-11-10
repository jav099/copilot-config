# Javier's Personal Instructions

- Never run presubmit unless Javier explicitly requests it.
- Agents must not reply to comments or communicate with other people on Javier's
  behalf unless Javier explicitly requests the action or explicitly confirms it.
- Use `out/debug_full_x64` as the build directory unless Javier explicitly
  specifies another directory.

- When writing web tests (WPT tests) do NOT add comments to the HTML.
- Do not expose Blink-specific implementation names in external-facing tests
  (like WPT tests).

- Avoid scope creep. If a change is not directly related to the task at hand, do not make it.
  If you think a change is necessary, ask the user first.

## Chromium Source Code

This is the Chromium open-source browser engine codebase.

- Do not assume that `#include` directives are necessary or add them
  preemptively. Add them only when required by the style guide or for
  compilation. Prefer forward declarations.

- IMPORTANT: When fixing merge conflicts DO NOT build or run gclient sync.

### Building and Testing

Use the following build and test tools:

- **`edge-agents:build`**: Use this skill by default to build Chromium targets.
  If the BOB canvas is available, use the `edge-agents:bob` plugin instead.
  Build through BOB and open its canvas extension to show build progress.
- **`/edge-developer-core:test`**: Run gtest (unit/browser) and Blink web tests.

- IMPORTANT: When fixing merge conflicts DO NOT build or run gclient sync.

### Debugging with Playwright

You can use the local Chromium build at `out/debug_full_x64` with Playwright to
take screenshots, open HTML files, and inspect rendering. Playwright is
available through `npx` (installed at `/tmp/node_modules`).

The executable path for the local Chromium build is only for macOS,
and may need to be adjusted for other platforms. Will probably be
`out/debug_full_x64/chrome` on Linux and Windows.

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