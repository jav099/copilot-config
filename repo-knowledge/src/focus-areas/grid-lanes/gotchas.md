# Grid-Lanes Gotchas

> Grid-lanes (CSS Grid 3 masonry) is **experimental and under active development**. Many areas have
> explicit TODOs and unresolved-spec caveats. Treat behavioral claims as "true as of this writing"
> and re-verify against the code (and csswg-drafts#12803 / #10275) before relying on them.

## 1. GC Ownership & Memory

| Type | Strategy | Notes |
|------|----------|-------|
| `LayoutGridLanes` | `GarbageCollected` (LayoutObject) | Holds `std::optional<GridPlacementData> cached_placement_data_` (inline, not GC) |
| `GridLanesItemGroup` | `GarbageCollected` | Owns shared `Member<GridItemData::VirtualItemContributions>`; traced via `Trace()` |
| `VirtualItems` | `GarbageCollected` | `Member<GridItems> items` + `GridLanesItemGroups item_groups` (`HeapVector<Member<...>, 16>`) |
| `GridLanesItemGroupProperties` | `DISALLOW_NEW()` | Hash-map key; holds `std::optional<GridSpan>` + `std::optional<BaselineGroup>` (no GC pointers) |
| `GridLanesRunningPositions` | **NOT** GC'd | Plain object built on the **stack** in `Layout()`; holds `Vector<Vector<TrackOpening>>` + `Vector<TrackData>` |
| `TrackOpening`, `TrackData`, `EligibleTrackOpeningPath`, `MaxPositionSpan` | plain structs (`TrackData` is `DISALLOW_NEW()`) | Live inside `GridLanesRunningPositions` |
| `StackingBaselineAccumulator` | `STACK_ALLOCATED()` | Holds a `GridLanesRunningPositions&` reference — must not outlive it |
| `GridLanesLayoutAlgorithm` | stack-local | Constructed in `CreateAlgorithmAndRun` as a local; not heap-owned |
| `GridLanesNode` | value handle | Lightweight `BlockNode` wrapper around a `LayoutBox*` |

## 2. Feature-Flag Gating — Single Choke Point (the CSS parser)

Unlike gap-decorations (three guard points), grid-lanes is effectively gated at **one** place: the
**CSS parser** rejects `display: grid-lanes` / `inline-grid-lanes` and the `grid-lanes-*` /
`flow-tolerance` properties when `RuntimeEnabledFeatures::CSSGridLanesLayoutEnabled()` is false
(`longhands_custom.cc` ~3687/3704, `css_parsing_utils.cc` ~7186). If the keyword never parses, no
`LayoutGridLanes` object is created (`layout_object.cc:424`), so the dispatch in `block_node.cc:173`
and the whole algorithm are never reached. There is **no paint guard** — grid-lanes emits ordinary
box fragments.

**Consequence for tests:** `blink_unittests` turns experimental features on globally, so
`display: grid-lanes` parses with no scoper. To test the **off** state you must use the
`virtual/disable-css-grid-lanes-layout` web-test suite (or add your own `ScopedCSSGridLanesLayoutForTest scoped(false)` in C++). See testing.md.

## 3. "Grid axis" vs "stacking axis" — the central mental-model trap

`GridTrackSizingDirection` (`kForColumns`/`kForRows`) is reused from grid, but in grid-lanes it
denotes the **grid axis** (the axis that actually has tracks), **not** a literal column/row of the
masonry packing. Pitfalls:

1. **Only the grid axis has tracks.** `BuildSizingCollection()` is a **no-op** when
   `track_direction != grid_axis_direction`. `ComputedStyle::HasGridTrackAxis(dir)` is true only for
   the grid axis. Don't try to build/size tracks for the stacking axis.
2. **The grid axis is direction-dependent.** `Style().GridLanesTrackSizingDirection()` returns
   `kForColumns` for `grid-lanes-direction: column` (and for `normal` when only
   `grid-template-columns` is set), `kForRows` for `row`. **`normal` defaults to columns** when
   neither (or both) templates are set — an easy authoring surprise.
3. **Column vs row grid-lanes take different code paths.** Column grid-lanes stack in the **block**
   axis (`intrinsic_block_size_` = stacking-axis size) and use `StackingBaselineAccumulator`; row
   grid-lanes stack in the **inline** axis and use the regular `GridBaselineAccumulator`, deriving
   `intrinsic_block_size_` from `track_collection.CalculateSetSpanSize()` (captured **before** any
   re-run — see §7).

## 4. Running positions, openings & dense packing

4. **The last `TrackOpening` per track must be open-ended.** `UpdateRunningPositionsForSpan` has
   `CHECK_EQ(last_track_opening.end_position, LayoutUnit::Max())`. The tail opening's
   `start_position` *is* the track's current running position; code that mutates openings must
   preserve this invariant.

5. **New openings are only created when dense-packing.** `UpdateRunningPositionsForSpan` with a
   `max_running_position_for_span` argument splits an opening, and it `DCHECK(is_dense_packing_)`.
   `GetEligibleTrackOpeningAndUpdateGridLanesItemSpan` also `DCHECK(is_dense_packing_)`. Don't invoke
   the opening-search paths outside dense mode.

6. **`AccumulateTrackOpeningsToAccommodateItem` returns indices in REVERSE order.** It's a recursive
   backtracking search across adjacent tracks; the caller walks `track_opening_indices` from the end
   and decrements `current_track_index`. There's a TODO to find a faster erase data structure — this
   path can be expensive for many openings.

7. **Collapsed tracks are pinned to `LayoutUnit::Max()`** in both constructors so items are never
   placed there. If you add a constructor path, replicate the collapse handling.

8. **Tie-breaking ("possible lines") uses `flow-tolerance`.** `GetFirstEligibleLine` accepts any line
   whose span max-position is within `tie_threshold_` of the minimum, then picks the first ≥ the
   auto-placement cursor (wrapping). `tie_threshold_` comes from `ResolveFlowToleranceForGridLanes`,
   which resolves the `flow-tolerance` property **against the stacking-axis available size** and
   **defaults to the font's computed pixel size** when `normal`. `infinite` is a TODO
   (`length_utils.cc:1379`). Mis-resolving the axis or default changes placement.

9. **Reverse directions are two separate concepts.** `track-reverse`
   (`IsReverseGridLanesTrackDirection` → `is_reverse_track_direction_`) flips the iteration/tie-break
   order and the cursor's start; `fill-reverse` (`IsReverseGridLanesFillDirection`) stacks from the
   container **end** and negates the content-alignment offset. They're independent. Per
   `grid_lanes_running_positions.{h,cc}` and `grid_lanes_direction.h` TODOs, **the keyword that
   triggers reverse placement may change** pending csswg-drafts#12803.

## 5. Track sizing via virtual items (non-obvious grid reuse)

10. **Track sizing never sees real items — only virtual items.** Per `#track-sizing-performance`,
    items are grouped by `(span, baseline group)` and one virtual item per group feeds the grid
    track-sizing algorithm. Auto-placed groups are **replicated into every valid start position**
    (`PlaceItemInEveryPosition`) so each track gets the worst-case contribution. If you reason about
    track sizes from a single item you'll be wrong.

11. **`GridLanesItemGroupProperties` default and "deleted" hash-key states collide by value**, so
    `GetHash()` special-cases them (`0` vs `numeric_limits<unsigned>::max()`) and the baseline group
    is folded into the hash. Changing the key fields requires updating `GetHash()`/`operator==`.

12. **`masonry-intrinsic-repeat` needs a second sizing pass.** When a `repeat()` has intrinsic
    track(s), the first pass sets `needs_intrinsic_track_size = true`, builds single-span
    zero-contribution virtual items to read growth limits, then `CalculateIntrinsicTrackSizes()` +
    a re-run of `ComputeSizingTreeInGridAxis()` computes the real repetition count. Skipping the
    re-run yields wrong repeat counts.

## 6. Two-pass placement & baselines

13. **Items are added to the container ONLY in `kFinalPlacement`.** The `kCalculateBaselines` pass
    measures baseline-aligned items and stores per-track baselines but does **not** call
    `AddResult`. Both passes must update running positions for **all** items (the baseline-skip
    `continue` happens *after* the running-position update) or placement state desyncs.

14. **Subgrids are skipped in the baseline pass** to avoid corrupting their cached placement data;
    the subgrid sibling iterator is only advanced during `kFinalPlacement`.

15. **Baseline alignment exists only in the grid axis.** The stacking axis uses `AxisEdge::kStart`.
    `StackingBaselineAccumulator` synthesizes container baselines from per-track first/last item
    baselines "similar to multicolumn"; it's used for **column** grid-lanes only.

## 7. Subtle ordering / sizing edges

16. **Row grid-lanes capture `intrinsic_block_size_` BEFORE re-runs.** In
    `ComputeGridLanesSizingTree`, the block-size is snapshotted from the track collection before any
    additional track-sizing pass, "so the container height is not affected by the re-run, matching
    grid behavior." Moving this capture changes container height.

17. **`LayoutGridLanes::GridLanesItemOffset()` always returns `LayoutUnit()`** — "Distribution offset
    is baked into the `gutter_size` in Grid Lanes." Don't assume a separate distribution offset like
    grid has.

18. **`GetName()` returning `"LayoutGridLanes"` is load-bearing.** The header warns it affects a
    production behavior in DevTools (`tool_highlight.ts`). Don't rename casually.

19. **Placement happens AFTER track sizing**, so `must_invalidate_placement_cache` is accepted but
    **unused** in `GridLanesNode::ConstructGridItems` (kept only for a common call signature with
    grid). The placement cache is far less relied upon than in grid.

## 8. Subgrid caveats (much is unfinished)

20. **Subgridding only works in the grid axis.** `AdjustSubgriddedItemSpan` / `ConstructGridItems`
    `CHECK`/branch on `MustConsiderGridItemsForSizing(grid_axis_direction)`; the stacking axis has no
    subgridded tracks.

21. **Auto-placed subgrids juggle a placeholder span.** Sized at the container start
    (`ComputeSetIndicesForSubgrid`), reset to indefinite at placement
    (`FinalizeItemSpanAndGetMaxPosition`), then re-inherited via
    `RebuildSubgridLayoutDataForResolvedPlacement`. That rebuild re-runs standalone-axis sizing
    **only for the row case** — `CompleteTrackSizingAlgorithmInStandaloneAxis` has a TODO asking
    "Can we get the column case working as well?" (`grid_lanes_layout_algorithm.h:206`).

22. **Nested subgrids are knowingly incorrect.** `RunGridLanesPlacementPhase` has a TODO: "What about
    nested subgrids? Those won't be updated correctly." (`grid_lanes_layout_algorithm.cc:545`).

23. **`LayoutGridLanes` is missing subgrid methods** that `LayoutGrid` has
    (`layout_grid_lanes.h:31` TODO) — DevTools/queries that work for grid subgrids may not for
    grid-lanes.

## 9. Unresolved-spec / in-flux areas (verify before trusting)

24. **`grid-lanes-direction` has no final spec link.** `grid_lanes_direction.h:16` TODO: "Add actual
    link to spec once we have a resolution one way or another." The syntax
    (`normal | [ row | column ] [ fill-reverse || track-reverse ]?`) and the very name "grid-lanes"
    track csswg-drafts#12803; commits use the `[Masonry]` tag.

25. **`GridLanesDirection` enforces invariants via `CHECK`.** Its constructor `CHECK`s that `kNormal`
    is never paired with `is_fill_reverse`/`is_track_reverse`. A converter that builds an invalid
    combination will crash, not silently coerce.

26. **Alignment & OOF content-alignment are partly TODO.** `RunGridLanesPlacementPhase` defers
    self-alignment refinements to csswg-drafts#10275 (`:723`), and `Layout()` notes that
    `justify-content`/`align-content` and `fill-reverse` for **out-of-flow** items are not fully
    handled yet (`:196`). Fragmentation is unimplemented (TODOs at `:874`; the whole WPT
    `fragmentation/` dir is `Skip`ped — see testing.md).

27. **Many subgrid/standalone-axis/baseline code paths carry `TODO(almaher)`** (e.g.
    `grid_lanes_layout_algorithm.cc` lines 1518/1706/1753/1801/1822/1889/1940/2125). When touching
    subgrid sizing, expect placeholder logic and re-derive correctness from the spec.

## 10. Misc invariants easy to trip

28. `GridLanesLayoutAlgorithm` constructor `DCHECK(params.space.IsNewFormattingContext())` — it
    always establishes a new formatting context.
29. `GridLanesNode` constructor `DCHECK(box->IsLayoutGridLanes())` — only wrap genuine grid-lanes
    boxes.
30. `CalculateAndCacheTrackSizes` `CHECK_EQ(line_positions.size(), TrackCount() + 1)` — N tracks ⇒
    N+1 line positions; it also subtracts the gutter for all but the last track. Only invoked when
    dense-packing.
