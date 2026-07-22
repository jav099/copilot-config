---
name: wpt-reftest-author
description: Author and visually validate Chromium Web Platform Test (WPT) reftests - creating or filling in a test/-ref.html pair, manually mocking unsupported paint in a ref with positioned elements, and comparing test/ref screenshots or geometry during authoring. Use when asked to create/write a WPT reftest, create or fill a `-ref.html`, mock painting that Blink doesn't otherwise support in a reference file, or visually validate a test/ref pair with Playwright before running the official test runner. Does not cover debugging an existing failure that already has official actual/expected/diff artifacts - see webtest-debugger for that. Does not cover browser/session mechanics (Playwright resolution, browser launch) - see playwright-browser-runner for that.
---

# WPT Reftest Author

Author a Chromium WPT reftest (test + `-ref.html`) and validate it visually with Playwright before
relying on the official test runner.

## Workflow

1. **Survey neighboring tests first.** Before writing anything, use your normal glob/view/search
   tools to read a handful of existing tests in the same directory (no bundled survey script - just
   look). Infer from local precedent: naming, `<link>` metadata, CSS custom properties used,
   reference strategy (real layout vs. manual mock), colors, `body` margin reset, comment policy, and
   paint order. Follow what the neighbors do unless it conflicts with the rules below.

2. **Choose reftest only when visual comparison is the right check.** Prefer reusing real layout in
   the ref (e.g. the same markup with an equivalent, supported CSS mechanism) and mock only the parts
   Blink can't otherwise render (see `references/manual-ref-patterns.md`).

3. **Metadata order is fixed, regardless of what some neighbors do:**
   - **Test**: doctype, `<title>`, author link, help link(s), match link.
   - **Ref**: doctype, author link, help link(s) - no title, no match.
   - The `<title>` must by itself state what is being tested. Do not add a `meta name="assert"` -
     it's redundant with a good title.

4. **Match the neighbors' comment policy.** If neighboring tests have no comments, add none - even
   to explain a manual ref mock. Put that reasoning in your own scratch validation notes instead
   (outside the repo, see step 11), not in the file.

5. **Get paint order right in manual overlay refs.** DOM order determines which positioned mock
   paints on top (later in DOM order paints over earlier, all else equal). Example: to reproduce the
   default row-over-column stacking for gap decorations, emit the column-rule mock elements before
   the row-rule mock elements. See `references/manual-ref-patterns.md`.

6. **Validate visually with Playwright - this is the primary check, not a formality:**
   - Capture full screenshots and content crops of both test and ref with `scripts/capture-reftest.cjs`.
   - Compare container/item rects in DOM order, and inspect manual mock geometry/styles.
   - Pixel diffs are recorded, not required to be zero by default - unsupported native paint can
     legitimately differ from a hand-built mock. Pass `--require-pixel-match` only when you expect
     exact equality (e.g. a self-comparison, or a mock you expect to be pixel-perfect).
   - Pass `--require-geometry-match` only when the test and ref really should share container/item
     geometry - don't assume every valid ref does.
   - Use `--mask` to exclude labels or unrelated regions from the pixel diff.
   - Generate the labeled TEST/REF comparison image, and for more than two images use
     `scripts/make-contact-sheet.cjs`.
   - **Look at the output.** The scripts report numbers; you make the call on whether the rendering
     is correct. See `references/deterministic-capture-protocol.md` for exactly what "deterministic"
     means here.

7. **Treat `run_web_tests.py` as an optional backup, not a required step.** Whether it's worth
   running depends on the use case - e.g. a test that's expected to fail (tracked by a bug) will fail
   there by design, and that's fine. Don't make finishing the task contingent on a passing run. When
   you do run it, its rendering is authoritative over Playwright's.

8. **Presubmit is optional**, not a default mandatory step for this workflow.

9. **This skill doesn't resolve Playwright or pick a browser binary itself** - see the
   `playwright-browser-runner` skill for that. `scripts/capture-reftest.cjs` requires a
   caller-resolved Playwright package (`--playwright-package`, `NODE_PATH`, or a project dependency);
   it does not import that skill's files or auto-invoke it.

10. **Hand off existing failures.** If official `run_web_tests.py` actual/expected/diff artifacts
    already exist and need debugging, use `webtest-debugger` instead - this skill is for authoring
    and pre-validation, not for triaging a completed run's output.

11. **Keep scratch artifacts out of the repo.** Write screenshots, manifests, and comparison images
    to the current Copilot session's artifact directory (or `/tmp`), never into the working tree.

## Scripts

- `scripts/capture-reftest.cjs --test <path> --ref <path> --out <dir> [options]` - the main tool.
  Loads a caller-provided Playwright, launches a browser (`--executable`/`--channel`), captures both
  pages deterministically, extracts geometry (`--container`, `--item`, `--mock` selectors), computes
  a pixel diff (with optional `--mask`), builds a labeled comparison image, and writes a JSON
  manifest. Run with `--help` for all options.
- `scripts/compare-images.cjs <a.png> <b.png> [--diff-output <path>]` - standalone two-image
  comparison (dimensions, differing-pixel count, bounding rect), for when you already have PNGs.
- `scripts/make-contact-sheet.cjs <image...> --out <sheet.png> [--columns <n>]` - labeled contact
  sheet from a set of images, for comparing more than a test/ref pair at a glance.

All three require Playwright to already be resolvable (`--playwright-package`, `NODE_PATH`, or a
project dependency) - they never install it themselves.

References: `references/deterministic-capture-protocol.md`, `references/manual-ref-patterns.md`.
