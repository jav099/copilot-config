# Deterministic capture protocol

`capture-reftest.cjs` applies the same settling steps to both the test and the ref page before
taking any screenshot, so a diff reflects real rendering differences rather than capture noise:

1. Fixed viewport (default 800x600) and device scale factor (default 1), set explicitly rather than
   inherited from a default context.
2. Navigate with `waitUntil: 'load'`.
3. Await `document.fonts.ready`.
4. If `<html class="reftest-wait">` is present, wait for it to be removed (10s timeout) before
   continuing - the standard WPT signal that a test isn't ready to be captured yet.
5. Two nested `requestAnimationFrame` calls, to land after the next composited frame.
6. Animations, transitions, and the caret are disabled via an injected stylesheet
   (`context.addInitScript`), so unrelated timing doesn't leak into the screenshot.
7. Full-page viewport screenshot, plus an optional crop (`--crop <selector>`) to a specific
   element's bounding box for a tighter before/after look at just the content that matters.

## What gets compared

- **Geometry**: `getBoundingClientRect()` plus a handful of computed border/background properties,
  for `--container`, each `--item`, and each `--mock` selector. Comparison is by DOM order and index,
  not by any semantic matching - selectors should pick out corresponding elements in the same order
  in both files.
- **Pixels**: exact equality, computed via a `<canvas>` `getImageData` diff in the browser (no
  `pngjs` dependency). Reports differing-pixel count and the bounding rect of the diff region.
  `--mask <selector>` excludes regions (e.g. text labels) from this comparison in both images.
- **Manifest**: every run writes a JSON manifest with package/browser info, screenshot paths and
  hashes, geometry, pixel-diff results, and any page/console errors observed on either page.

## Why pixel/geometry mismatches don't fail by default

A reftest's job is to prove the *rendered result* matches, not that the DOM or paint mechanism is
identical. A manually mocked ref (positioned divs standing in for paint Blink can't otherwise
produce) will often have different geometry from the test's real layout, and unsupported native
paint can legitimately differ pixel-for-pixel from a hand-built approximation while still being an
acceptable reftest. Treat `--require-pixel-match` and `--require-geometry-match` as assertions you
opt into when you specifically expect equality (e.g. a self-comparison, or validating that a ref's
container tracks the test's real layout).
