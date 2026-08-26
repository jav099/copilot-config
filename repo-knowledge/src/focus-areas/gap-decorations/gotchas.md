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

## 2. Activation and guards

Gap decorations are unflagged. Layout normally avoids geometry unless `ComputedStyle::HasGapRule()` is true; grid also builds geometry when fragmentation needs gap-suppression data. Paint requires fragment `GapGeometry` and respects `ShouldSkipGapDecorations()`. Legacy multicol `column-rule-*` properties remain supported through the same style, geometry, and shared paint path: `IsGapDecorationsContainer()` recognizes multicol via `SpecifiesColumns()`.

## 3. Container-Dependent Resolution

| Behavior | Grid | Grid-lanes | Flex | Multicol |
|----------|------|------------|------|----------|
| Cross gap sharing | Shared across all main gaps | Per-lane; each cross gap belongs to one lane | Per-main-gap ranges | Shared (like grid) |
| `rule-break: normal` | `normal` | `normal` | `normal` | row->`none`, col->`intersection` |
| `rule-visibility-items: normal` | `all` | `all` | `between` | `between` |
| Main direction | Always `kForRows` | Grid axis (`kForRows` or `kForColumns`) | `kForRows` (row) / `kForColumns` (col) | Always `kForRows` |
| Overlap windows | N/A (aligned) | N/A | Yes (non-uniform cross-gap overlap) | N/A (aligned) |
| Spanners | Affect `GapSegmentState` | Mark blocked main-gap ranges | No spanners | Create 2 `MainGap`s (`kStart`/`kEnd`) |

Grid-lanes main intersections merge neighboring lanes' cross-gap runs. Each stacking-axis cross gap has exactly two lane-boundary intersections. Fragmented grid-lanes gap decorations are not supported.

## 4. Paint Order

- Gap decorations paint **after background and borders** but **before foreground content** (box decoration background phase)
- `rule-overlap` controls stacking: `row-over-column` (default) paints columns first then rows
- **Scrolling containers**: Explicitly skipped (`SetSkipsGapDecorations(true)`) for border box space paint pass; only painted in contents space pass
- For `overflow: hidden`: a special `ScopedBoxContentsPaintState` is created for gap decoration painting even when one doesn't exist for background
- Uses `BoxBorderPainter::DrawBoxSide()` -- inherits auto dark mode behavior

## 5. Fragmentation Complexity

- **Grid**: Most complex. `full_gap_geometry` stored in `GridBreakTokenData`, reused across fragments. Per-fragment geometry created with adjusted main gaps and content block offsets. Cross gap ranges adjusted via `AdjustCrossGapsRangesForFragmentation()`.
- **Flex**: `FlexGapAccumulator` is per-fragment. `SuppressLastMainGap()` handles fragment boundary row gap suppression.
- **Cross-gap owner state is local to paint.** `GapDecorationsPainter` advances a forward-only owner cursor for flex lines or grid-lanes lanes. The mutable `GapGeometry` state that remains is multicol's spanner-adjacent intersection set.
- Cross gap segment state ranges have a `range_start_idx` per cross gap updated during fragmentation adjustment.

## 6. Common Mistakes & Sharp Edges

### Data Structure Traps

1. **Don't call `GetValue()` on a repeater `GapData`** -- it `CHECK`-crashes. Always check `IsRepeaterData()` first. Similarly, don't call `GetValueRepeater()` on a non-repeater.

2. **Don't call `RepeatCount()` on an auto repeater** -- it `CHECK`-crashes. Check `IsAutoRepeater()` first.

3. `GapDataListIterator` is a one-way sequential cursor and has no reset API. For identity order, paint constructs one iterator for each width, style, and color list on an axis. Reversed flex patterns use `GapDataListValueAccessor`; flex and grid-lanes cross gaps separately advance a paint-local owner cursor.

### Layout Traps

4. **Main gaps can be empty for multicol spanners** -- `GenerateMainIntersectionList()` returns an empty vector for spanner main gaps. The paint loop skips them via `IsMultiColSpanner()`. Forgetting this check produces empty intersection lists.

5. **`IsCapIntersection()` has different logic per container type** -- grid: first/last are caps. Flex cross gaps: depends on `CrossGap::EdgeIntersectionState`. Multicol: includes spanner-adjacent intersections (tracked via the `multicol_spanner_adjacent_intersections_` set). Don't assume uniform behavior. (Method was formerly `IsEdgeIntersection()`.)

6. **Overlap windows in flex are complex** -- `ProcessCrossGapIntersection` uses in-place mutation of the last intersection. Maintains a "preemptive open" state that gets confirmed or reset. Edge case: last intersection must be checked for unconfirmed open state.

### Property/Flag Traps

7. **Legacy `column-rule-*` properties are unflagged** -- they use the same style, geometry, and shared paint path as other gap-decoration properties.

8. **`column-rule` is the same shorthand for legacy multicol and gap decorations** -- it expands to `column-rule-width/style/color`, which are the gap-decoration-aware `GapDataList<T>` longhands. Sites using `column-rule` for multicol use those same longhands. (`-webkit-column-rule` is an alias for `column-rule`.)

### Style/Optimization Traps

9. **The `HasGapRule()` optimization flag** (`MaybeHasGapDecorations()`) is conservative -- can be `true` even if effective rule is invisible (e.g., `none` style). Always follow up with `HasColumnRule()` / `HasRowRule()` which check all three components (width > 0, non-transparent color, visible style).

10. **Ink overflow includes gap decorations AND insets** -- `ComputeInkOverflowForGaps()` uses `MaxGapDecorationsWidth()` for thickness and `MaxGapDecorationInsetOutset()` for negative cap/junction insets that extend rules past the content box. If adding a property that affects visual bounds (thickness or inset), update ink overflow computation.

### Naming Confusion

11. **`GridTrackSizingDirection` is used beyond grid** -- Despite the "Grid" prefix, `kForRows`/`kForColumns` are used universally across grid, grid-lanes, flex, and multicol. Known naming issue (see TODO in `gap_geometry.h`).

12. **Segment states are precomputed (no longer binary-searched in the hot path)** -- crbug.com/440123087 replaced the per-intersection binary search with a precomputed forward-pass `GapSegmentStateCursor` (O(1) per intersection). A residual `std::lower_bound` remains in `GetIntersectionGapSegmentState()` only for certain overlap-join cross-gap states; a follow-up TODO (crbug.com/440123087) tracks removing it.
