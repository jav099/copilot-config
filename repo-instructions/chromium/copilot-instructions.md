# Chromium Source Code

This is the Chromium open-source browser engine codebase.

## Building and Testing

Use the `edge-developer-core` plugin skills:

- **`/edge-developer-core:build`** — Build Chromium targets with autoninja
- **`/edge-developer-core:test`** — Run gtest (unit/browser) and Blink web tests

Other useful skills: `/edge-developer-core:iterate` (build + test loop), `/edge-developer-core:gncheck` (GN dependency checks).

## Debugging with Playwright

You can use the local Chromium build at `out/debug_full_x64` with Playwright to take screenshots, open HTML files, and inspect rendering. Playwright is available via `npx` (installed at `/tmp/node_modules`).

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

Run scripts with `cd /tmp && node script.js`. If `playwright` is not installed, run `cd /tmp && npm install playwright` first.

## Project Notes

### intern-project

The `intern-project/` directory contains work related to a CSS Counter Styles Level 3 project for an intern being mentored by the repo owner.

**Directory contents:**
- `project-plan.md` — 12-week project plan with milestones and deliverables
- `current-impl.md` — Analysis of what is/isn't implemented in Blink, with file and method references
- `counter-styles-demo.html` — Interactive demo page showing @counter-style features

**Reference links (use when answering counter-style or symbols() questions):**
- [MDN: @counter-style](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@counter-style)
- [MDN: symbols()](https://developer.mozilla.org/en-US/docs/Web/CSS/symbols)
- [CSS Counter Styles Level 3 Spec](https://drafts.csswg.org/css-counter-styles-3/)
- [WPT: css-counter-styles](https://wpt.fyi/results/css/css-counter-styles)

**Lookup priority:** For questions about counter styles or `symbols()`, check MDN first (concise, practical). If the answer isn't there, reference the spec (comprehensive but large). For test coverage or interop questions, check the WPT suite. For Chromium-specific implementation details, see `current-impl.md`.
