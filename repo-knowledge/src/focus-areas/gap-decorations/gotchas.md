# Gap Decorations Gotchas

## 1. GC Ownership & Memory

| Type | GC Strategy | Notes |
|------|-------------|-------|
| `GapGeometry` | `GarbageCollected` | Stored via `Member<GapGeometry>` in `PhysicalFragmentRareData` |
| `GapData<T>` | `DISALLOW_NEW()` | Inline-stored; holds `Member<ValueRepeater<T>>` (GC'd) |
| `GapDataList<T>` | `DISALLOW_NEW()` | Contains `HeapVector<GapData<T>, 1>` (traced) |
| `MainGap`, `CrossGap` | **NOT** GC'd | Stored in plain `Vector<>` inside `GapGeometry` -- no GC pointers within |
| `GapDecorationsPainter` | `STACK_ALLOCATED()` | Lives on stack only during paint |
| `GapSegmentStateAggregator` | `STACK_ALLOCATED()` | Lives on stack during layout |
| `ValueRepeater<T>` | `GarbageCollected` | Must be properly traced |

## 2. Feature Flag Gating -- Three Guard Points

Gap decorations are gated at **three separate points**:

1. **Layout**: Each algorithm checks `RuntimeEnabledFeatures::CSSGapDecorationEnabled() && Style().HasGapRule()` before building `GapGeometry`. If off, no geometry created, no memory consumed.

2. **Paint**: `BoxFragmentPainter` checks `box_fragment_.GetGapGeometry() && !paint_info.ShouldSkipGapDecorations() && RuntimeEnabledFeatures::CSSGapDecorationEnabled()`.

3. **Legacy column-rule suppression**: `PaintColumnRules()` returns early if `box_fragment_.GetGapGeometry() || RuntimeEnabledFeatures::CSSGapDecorationEnabled()` -- prevents legacy multicol painting when gap decorations are active.

**Critical**: `column-rule-color`, `column-rule-style`, `column-rule-width` do NOT have the `CSSGapDecoration` runtime flag because they're legacy properties. When the flag is off, these properties still work via the legacy `PaintColumnRules()` path.

## 3. Container-Dependent Resolution

| Behavior | Grid | Flex | Multicol |
|----------|------|------|----------|
| Cross gap sharing | Shared across all main gaps | Per-main-gap ranges | Shared (like grid) |
| `rule-break: normal` | `normal` | `normal` | row->`none`, col->`intersection` |
| `rule-visibility-items: normal` | `all` | `between` | `between` |
| Main direction | Always `kForRows` | `kForRows` (row) / `kForColumns` (col) | Always `kForRows` |
| Overlap windows | N/A (aligned) | Yes (non-uniform cross-gap overlap) | N/A (aligned) |
| Spanners | Affect `GapSegmentState` | No spanners | Create 2 `MainGap`s (`kStart`/`kEnd`) |
| Flex-line iterator reset | N/A | Iterators reset per flex line | N/A |

## 4. Paint Order

- Gap decorations paint **after background and borders** but **before foreground content** (box decoration background phase)
- `rule-overlap` controls stacking: `row-over-column` (default) paints columns first then rows
- **Scrolling containers**: Explicitly skipped (`SetSkipsGapDecorations(true)`) for border box space paint pass; only painted in contents space pass
- For `overflow: hidden`: a special `ScopedBoxContentsPaintState` is created for gap decoration painting even when one doesn't exist for background
- Uses `BoxBorderPainter::DrawBoxSide()` -- inherits auto dark mode behavior

## 5. Fragmentation Complexity

- **Grid**: Most complex. `full_gap_geometry` stored in `GridBreakTokenData`, reused across fragments. Per-fragment geometry created with adjusted main gaps and content block offsets. Cross gap ranges adjusted via `AdjustCrossGapsRangesForFragmentation()`.
- **Flex**: `FlexGapAccumulator` is per-fragment. `SuppressLastMainGap()` handles fragment boundary row gap suppression.
- **`main_gap_running_index_`** is **`mutable`** in `GapGeometry` -- mutated during paint-time cross-gap end offset computation. Design compromise; TODO to move state to parent paint call.
- Cross gap segment state ranges have a `range_start_idx` per cross gap updated during fragmentation adjustment.

## 6. Common Mistakes & Sharp Edges

### Data Structure Traps

1. **Don't call `GetValue()` on a repeater `GapData`** -- it `CHECK`-crashes. Always check `IsRepeaterData()` first. Similarly, don't call `GetValueRepeater()` on a non-repeater.

2. **Don't call `RepeatCount()` on an auto repeater** -- it `CHECK`-crashes. Check `IsAutoRepeater()` first.

3. **`GapDataListIterator` is NOT reentrant** -- a single iterator must process all gaps for one direction. For flex cross gaps, `Reset()` is called per flex line to restart with a new gap count.

### Layout Traps

4. **Main gaps can be empty for multicol spanners** -- `GenerateMainIntersectionList()` returns an empty vector for spanner main gaps. The paint loop skips them via `IsMultiColSpanner()`. Forgetting this check produces empty intersection lists.

5. **`IsCapIntersection()` has different logic per container type** -- grid: first/last are caps. Flex cross gaps: depends on `CrossGap::EdgeIntersectionState`. Multicol: includes spanner-adjacent intersections (tracked via the `multicol_spanner_adjacent_intersections_` set). Don't assume uniform behavior. (Method was formerly `IsEdgeIntersection()`.)

6. **Overlap windows in flex are complex** -- `ProcessCrossGapIntersection` uses in-place mutation of the last intersection. Maintains a "preemptive open" state that gets confirmed or reset. Edge case: last intersection must be checked for unconfirmed open state.

### Property/Flag Traps

7. **`column-rule-color` has no runtime flag** -- legacy property. New column-rule features may be active even when `CSSGapDecoration` is disabled.

8. **`column-rule` is the same shorthand for legacy multicol and gap decorations** -- the `column-rule` shorthand (css_properties.json5:~9955) expands to `column-rule-width/style/color`, which are the gap-decoration-aware `GapDataList<T>` longhands. Sites using `column-rule` for multicol get the gap-decoration version when the flag is on. (`-webkit-column-rule` is an alias for `column-rule`.)

### Style/Optimization Traps

9. **The `HasGapRule()` optimization flag** (`MaybeHasGapDecorations()`) is conservative -- can be `true` even if effective rule is invisible (e.g., `none` style). Always follow up with `HasColumnRule()` / `HasRowRule()` which check all three components (width > 0, non-transparent color, visible style).

10. **Ink overflow includes gap decorations AND insets** -- `ComputeInkOverflowForGaps()` uses `MaxGapDecorationsWidth()` for thickness and `MaxGapDecorationInsetOutset()` for negative cap/junction insets that extend rules past the content box. If adding a property that affects visual bounds (thickness or inset), update ink overflow computation.

### Naming Confusion

11. **`GridTrackSizingDirection` is used beyond grid** -- Despite the "Grid" prefix, `kForRows`/`kForColumns` are used universally across grid, flex, and multicol. Known naming issue (see TODO in `gap_geometry.h`).

12. **Segment states are precomputed (no longer binary-searched in the hot path)** -- crbug.com/440123087 replaced the per-intersection binary search with a precomputed forward-pass `GapSegmentStateCursor` (O(1) per intersection). A residual `std::lower_bound` remains in `GetIntersectionGapSegmentState()` only for certain overlap-join cross-gap states; a follow-up TODO (crbug.com/440123087) tracks removing it.
