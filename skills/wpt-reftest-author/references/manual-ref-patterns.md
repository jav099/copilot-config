# Manual ref patterns and paint order

## Prefer real layout; mock only what's unsupported

Before reaching for a manual (positioned-div) mock, check whether the ref can reproduce the same
visual result with real, already-supported layout - e.g. an equivalent property, a different but
standard layout mode, or absolutely-positioned elements sized to match. This keeps the ref testing
what it looks like it's testing, and keeps it resilient to unrelated engine changes. Only fall back
to a manual mock for the specific piece of paint the engine doesn't otherwise support (this is
exactly the situation gap-decorations refs are in while column/row rules are still being
implemented).

## DOM order controls stacking

For absolutely/relatively positioned overlay elements with no explicit `z-index`, later elements in
DOM order paint on top of earlier ones. When a manual ref needs multiple mocked decorations to
overlap correctly, order them in the DOM to match the real paint order you're reproducing - don't
rely on visual layout position alone.

### Example: gap decorations row-over-column stacking

Blink's default paint order for grid/flex/multicol gap decorations paints row rules over column
rules at their intersections. To reproduce this in a manual ref, emit the column-rule mock elements
*before* the row-rule mock elements in the DOM:

```html
<!-- column rules first: painted first, so row rules paint over them at intersections -->
<div class="col-gap1"><div class="col-gap-segment"></div></div>
<div class="col-gap2"><div class="col-gap-segment"></div></div>

<!-- row rules last: paints on top -->
<div class="row-gap1"></div>
<div class="row-gap2"></div>
```

Getting this order backwards produces a ref that looks right at a glance (same colors, same
positions) but is wrong at every column/row intersection - exactly the kind of mistake the
visual/geometry validation in `scripts/capture-reftest.cjs` is meant to catch before relying on the
official test runner.

## Keep mocks minimal and precisely positioned

- Compute mock geometry from the same values the test uses (gap widths, track sizes, etc.) rather
  than eyeballing pixel positions, so the ref stays correct if those values change.
- Pass `--mock <selector>` to `capture-reftest.cjs` to pull back each mock's rect and computed style
  and confirm it lines up with the corresponding real geometry in the test.
- If neighboring refs don't comment on why a mock exists, don't add one either (see SKILL.md step
  4) - keep the reasoning in your own scratch notes instead.
