# Grid-Lanes (Masonry) Architecture

Grid-lanes is Blink's implementation of **CSS Grid Level 3 masonry layout**. Unlike 2-D grid, a
grid-lanes container has real grid tracks in **one** axis only — the **grid axis** — and packs items
along the orthogonal **stacking axis** (the "masonry"/flow axis) using per-track **running
positions**. It reuses the grid track-sizing machinery wholesale for the grid axis and adds a
bespoke placement engine for the stacking axis.

## Two-Axis Model

| Term | Meaning | Source of truth |
|------|---------|-----------------|
| **Grid axis** | The axis with explicit/implicit tracks, sized by the grid track-sizing algorithm | `ComputedStyle::GridLanesTrackSizingDirection()` returns `kForColumns` or `kForRows` |
| **Stacking axis** | The orthogonal "masonry" axis; no tracks — items flow/pack via running positions | implied (the other of `kForColumns`/`kForRows`) |
| **Column grid-lanes** | grid axis = columns, stacking axis = block (rows) | `grid-lanes-direction: column` (or `normal` defaulting) |
| **Row grid-lanes** | grid axis = rows, stacking axis = inline (columns) | `grid-lanes-direction: row` |

`GridLanesTrackSizingDirection()` resolves `grid-lanes-direction: normal` to columns if
`grid-template-columns` is set, else rows if `grid-template-rows` is set, else columns
(`computed_style.h` ~line 1193). `HasGridTrackAxis(dir)` returns true only for the grid axis (grid,
by contrast, has tracks in both).

## Data Flow Summary

```
CSS: display:grid-lanes; grid-template-columns/rows; grid-lanes-direction; grid-lanes-pack; flow-tolerance
  | (Style resolution; gated by RuntimeEnabledFeatures::CSSGridLanesLayoutEnabled())
ComputedStyle  (EDisplay::kGridLanes / kInlineGridLanes; GridLanesDirection; EGridLanesPack)
  | (LayoutObject factory: layout_object.cc -> MakeGarbageCollected<LayoutGridLanes>)
LayoutGridLanes : LayoutBlock   (caches GridPlacementData for DevTools)
  | (block_node.cc DetermineAlgorithmAndRun: box.IsLayoutGridLanes())
GridLanesLayoutAlgorithm::Layout()   (LayoutAlgorithm<GridLanesNode, BoxFragmentBuilder, BlockBreakToken>)
  | 1. GridLanesNode::ConstructGridItems()            -> GridItems (ordered by 'order')
  | 2. ComputeGridLanesSizingTree()
  |      - CollectItemGroups()                        -> group by (span, baseline group)  [track-sizing-performance]
  |      - BuildVirtualGridLanesItems()               -> VirtualItems (one+ per group)
  |      - track sizing on GRID AXIS (reuses grid)    -> GridSizingTree / GridLayoutData
  |      - MeasureVirtualGridLanesItems()             -> per-group contribution sizes + shared baselines
  |      - (intrinsic repeat re-run if needed)        [masonry-intrinsic-repeat]
  | 3. GridLanesRunningPositions(track_collection, style, flow_tolerance)
  | 4. PlaceGridLanesItems() -> RunGridLanesPlacementPhase()  (per item, in STACKING AXIS)
  |      - FinalizeItemSpanAndGetMaxPosition()        -> GetFirstEligibleLine() for auto-placed
  |      - (dense) GetEligibleTrackOpeningAndUpdateGridLanesItemSpan()
  |      - item_node.Layout(space); align; container_builder_.AddResult()
  |      - UpdateRunningPositionsForSpan(); UpdateAutoPlacementCursor()
  | 5. content alignment / fill-reverse; PlaceOutOfFlowItems()
container_builder_.SetGridLayoutData(); ToBoxFragment()   -> PhysicalBoxFragment
```

---

## 1. Entry, Dispatch & Object Model

| Layer | Class | File | Notes |
|-------|-------|------|-------|
| Style display | `EDisplay::kGridLanes`, `kInlineGridLanes` | `core/style/computed_style.h` (`IsDisplayGridLanes()` ~2722) | Created only when `CSSGridLanesLayoutEnabled()` |
| LayoutObject | `LayoutGridLanes : LayoutBlock` | `grid_lanes/layout_grid_lanes.{h,cc}` | `GetName()` returns `"LayoutGridLanes"` (affects DevTools `tool_highlight.ts`); `IsLayoutGridLanes()` final = true |
| Factory | `LayoutObject::CreateObject()` | `core/layout/layout_object.cc:424-427` | `case EDisplay::kGridLanes/kInlineGridLanes -> MakeGarbageCollected<LayoutGridLanes>` |
| Input node | `GridLanesNode final : BlockNode` | `grid_lanes/grid_lanes_node.{h,cc}` | `LayoutInputNode::IsGridLanes()` = `IsBlock() && box_->IsLayoutGridLanes()` |
| Algorithm | `GridLanesLayoutAlgorithm` | `grid_lanes/grid_lanes_layout_algorithm.{h,cc}` | `LayoutAlgorithm<GridLanesNode, BoxFragmentBuilder, BlockBreakToken>` |
| Dispatch | `DetermineAlgorithmAndRun()` | `core/layout/block_node.cc:171-174` | `else if (box.IsLayoutGridLanes()) CreateAlgorithmAndRun<GridLanesLayoutAlgorithm>` (right after `IsLayoutGrid()`) |
| Helper | `LayoutObject::IsLayoutGridOrGridLanes()` | `core/layout/layout_object.h:941` | many call sites share grid + grid-lanes paths via `IsGrid() || IsGridLanes()` |

The constructor `DCHECK(params.space.IsNewFormattingContext())` — grid-lanes always establishes a new
formatting context. `GridLanesNode`'s constructor `DCHECK(box->IsLayoutGridLanes())`.

`LayoutGridLanes` caches a `GridPlacementData` (`SetCachedPlacementData` / `CachedPlacementData()`)
populated during sizing (`BuildSizingCollection`), used by DevTools inspector highlighting and to
look up auto-repeat counts. Its DevTools helpers (`AutoRepeatCountForDirection`,
`ExplicitGridStart/EndForDirection`, `GridGap`, `TrackSizesForComputedStyle`, `GridTrackPositions`,
`LayoutData`) delegate to **static** `LayoutGrid` helpers
(`GetGridLayoutDataFromFragments`, `ComputeExpandedPositions`, `ComputeGridGap`,
`CollectTrackSizesForComputedStyle`).

---

## 2. Key Classes & Responsibilities

**`GridLanesLayoutAlgorithm`** (`grid_lanes_layout_algorithm.h` 371 / `.cc` 2427): Orchestrates the
whole layout. Notable members/methods:

| Method | Responsibility |
|--------|----------------|
| `Layout()` | Top-level: sizing tree -> running positions -> place items -> intrinsic block-size -> OOF -> fragment |
| `ComputeMinMaxSizes()` | Intrinsic inline sizing (min/max-content) |
| `ComputeGridLanesSizingTree()` | Builds sizing tree, runs grid-axis track sizing, intrinsic-repeat re-run, baseline alignment |
| `ComputeGridLanesGeometry()` | Wraps the above and finalizes a `GridLayoutSubtree` (used by tests + min/max) |
| `ComputeSizingTreeInGridAxis()` | Creates the sizing tree; sets `needs_intrinsic_track_size` out-param |
| `BuildSizingCollection()` | Grid-axis only: builds virtual items + ranges + `GridSizingTrackCollection`; **no-op for stacking axis** |
| `BuildVirtualGridLanesItems()` | Synthesizes virtual items per item-group (places auto items in every position) |
| `MeasureVirtualGridLanesItems()` | Computes per-group intrinsic contributions + shared baselines after track init |
| `ComputeSharedBaselineForGroup()` | Max baseline among items sharing a span+baseline group |
| `CalculateIntrinsicTrackSizes()` / `ComputeAutomaticRepetitions()` | `masonry-intrinsic-repeat` handling for `repeat()` with intrinsic tracks |
| `PlaceGridLanesItems()` | Drives final placement pass, container baselines, content alignment, fill-reverse |
| `RunGridLanesPlacementPhase()` | The per-item loop (placement + alignment + running-position updates) |
| `PlaceOutOfFlowItems()` | Adds OOF candidates (containing rect via `ComputeOutOfFlowItemContainingRect`) |
| `ComputeOutOfFlowItemContainingRect()` | **static**; also called from `out_of_flow_layout_part.cc:825` |
| `RebuildSubgridLayoutDataForResolvedPlacement()` | Re-inherits/re-sizes an auto-placed subgrid once its position is known |

Stored state: `intrinsic_block_size_`, `contain_intrinsic_block_size_`,
`grid_lanes_available_size_` / `_min_` / `_max_` (`LogicalSize`).

**`GridLanesRunningPositions`** (`grid_lanes_running_positions.h` 312 / `.cc` 541): The masonry
placement engine — see §4. Holds `track_collection_openings_` (`Vector<Vector<TrackOpening>>`),
per-track `track_data_` (`Vector<TrackData>`), `auto_placement_cursor_`, `tie_threshold_`,
`is_dense_packing_`, `is_reverse_track_direction_`.

**`GridLanesItemGroup` / `VirtualItems`** (`grid_lanes_item_group.h` 129): Implements the
`#track-sizing-performance` optimization — see §3. `GridLanesItemGroupProperties` is the hash key
(`GridSpan` + optional `BaselineGroup`). `GridLanesItemGroup` is `GarbageCollected` and owns a
shared `Member<GridItemData::VirtualItemContributions> contribution_sizes`. `VirtualItems` bundles
the synthesized `GridItems` and the source `GridLanesItemGroups`.

**`GridLanesNode`** (`grid_lanes_node.{h,cc}`): `BlockNode` extension. `ConstructGridItems()`
(collects children, sorts by `order`, resolves grid-axis spans, marks `is_auto_placed`),
`CollectItemGroups()` (groups items + computes `start_offset` / `max_end_line` /
`unplaced_item_span_count`), plus subgrid helpers `AdjustSubgriddedItemSpan()`,
`ComputeSetIndicesForSubgrid()`, `ComputeLargestChildSpanSize()`.

**`GridLanesDirection`** (`grid_lanes_direction.h` 46): `struct` with `GridLanesOrientation`
(`kNormal`/`kRow`/`kColumn`), `is_fill_reverse`, `is_track_reverse`. Models syntax
`grid-lanes-direction: normal | [ row | column ] [ fill-reverse || track-reverse ]?`. Constructor
`CHECK`s that `normal` is never paired with a reverse keyword.

**`StackingBaselineAccumulator`** (`stacking_baseline_accumulator.h` 103): `BaselineAccumulator`
subclass, `STACK_ALLOCATED()`. Handles container baselines along the **stacking axis** "similar to
multicolumn layout" by reading first/last baselines per track from
`GridLanesRunningPositions::TrackData`. Used only for **column** grid-lanes; row grid-lanes uses the
regular `GridBaselineAccumulator` (the grid axis is rows).

**`LayoutGridLanes`** (`layout_grid_lanes.{h,cc}`): see §1.

---

## 3. Grid-Axis Track Sizing (item groups + virtual items)

Per `#track-sizing-performance`, grid-lanes does **not** size tracks against every item. Instead it:

1. **Groups items** (`GridLanesNode::CollectItemGroups`) by `GridLanesItemGroupProperties` =
   `(GridSpan span, std::optional<BaselineGroup>)`. Items with the same span and baseline-sharing
   group land in one group (`GridLanesItemGroupMap = HeapHashMap<...>`). The baseline group
   (`std::nullopt` / `kMajor` / `kMinor`) is folded into the hash so first/last/non-baseline items
   stay separate.
2. **Synthesizes virtual items** (`BuildVirtualGridLanesItems`): one virtual item per group with a
   shared `VirtualItemContributions`. For **auto-placed** groups (indefinite span), a copy is placed
   in **every** valid start position across the implicit grid (`PlaceItemInEveryPosition`), so track
   sizing sees the worst-case contribution per track. `auto-fit` ranges are skipped beyond the
   unplaced span count (`#repeat-auto-fit`).
3. **Measures** (`MeasureVirtualGridLanesItems`): after track initialization, computes each group's
   intrinsic min/max contributions and per-track shared baseline (`ComputeSharedBaselineForGroup`),
   storing them on the shared `contribution_sizes` so all virtual items observe them.
4. Runs the regular grid track-sizing algorithm (reused) to produce a `GridSizingTrackCollection` ->
   `GridLayoutTrackCollection`.

### Intrinsic auto-repeat (`#masonry-intrinsic-repeat`)

If a `repeat()` definition contains intrinsic-sized track(s), the first pass sets
`needs_intrinsic_track_size = true` and uses single-span zero-contribution virtual items placed in
every position to read each track's growth limit; then `CalculateIntrinsicTrackSizes()` derives the
size and `ComputeSizingTreeInGridAxis()` re-runs to compute the final repetition count.

---

## 4. Stacking-Axis Placement (the masonry algorithm)

Driven by `RunGridLanesPlacementPhase()` (per item) against `GridLanesRunningPositions`.

### Running positions & track openings

`track_collection_openings_` is a `Vector<Vector<TrackOpening>>` indexed by track line. Each
`TrackOpening{start_position, end_position}` is a gap in the stacking axis; the **last** opening per
track is the open-ended tail `{current_running_position, LayoutUnit::Max()}`. Collapsed tracks are
pinned to `LayoutUnit::Max()` so nothing is placed in them.

### Choosing a line for an auto-placed item (`GetFirstEligibleLine`)

Per `#masonry-layout-algorithm`:
1. `GetMaxPositionsForAllTracks(span_size)` computes, for each candidate start line, the
   **max-position** = max running position among the spanned tracks.
2. `largest_max_running_position_allowed = min(max_positions) + tie_threshold_`. Lines whose
   max-position ≤ that are "possible lines" (the **flow-tolerance** tie band).
3. Choose the first possible line ≥ the **auto-placement cursor** (wrapping via the circular
   `RunningPositionsIterator`); if none, the first overall.

`tie_threshold_` comes from `ResolveFlowToleranceForGridLanes(style, available_size)` — the
`flow-tolerance` property (`normal` defaults to the font's computed pixel size; `infinite` TODO).

The item is placed at its span's max-position. `UpdateRunningPositionsForSpan()` advances each
spanned track's running position to `start + fragment_stacking_axis_contribution` (item size + gap +
margins, clamped ≥ 0). `UpdateAutoPlacementCursor()` moves the cursor to the item's end line (or
start line in reverse track direction).

### Dense packing (`grid-lanes-pack: dense`)

When dense, before finalizing each item the engine searches **earlier openings**:
- `GetEligibleTrackOpeningAndUpdateGridLanesItemSpan()` iterates candidate spans and calls
  `AccumulateTrackOpeningsToAccommodateItem()` — a **recursive backtracking** search across adjacent
  tracks for a vertically-aligned set of openings large enough for the item's stacking-axis
  contribution. It selects the highest (and, on ties, earliest-track) eligible opening, then erases
  or splits that opening (`EraseAt` / `insert`) and rewrites the item's span (`UpdateSpan`).
- When a multi-span item leaves part of a track unfilled, `UpdateRunningPositionsForSpan` (with
  `max_running_position_for_span`) records the **new opening** created below it.

`track_data_` (per-track sizes) is precomputed via `CalculateAndCacheTrackSizes()` only when dense.

### Reverse directions

`is_reverse_track_direction_` (from `IsReverseGridLanesTrackDirection()`, i.e. `track-reverse`)
flips iteration/tie-break direction and the cursor start. `fill-reverse`
(`IsReverseGridLanesFillDirection()`) stacks items from the **end** of the container; offsets are
mirrored in `RunGridLanesPlacementPhase` and `PlaceGridLanesItems`. (Per TODO/`#12803`, the keyword
that triggers reverse placement may change.)

---

## 5. Two-Pass Baseline Placement

`RunGridLanesPlacementPhase` runs under a `PlacementPhase`:
- **`kCalculateBaselines`**: measures baseline-aligned items and stores per-track baselines; does
  **not** add results to the container and **skips subgrids** (to avoid corrupting subgrid placement
  cache).
- **`kFinalPlacement`**: positions items using the known track baselines, applies self-alignment,
  and adds results (`container_builder_.AddResult`).

Both passes update running positions for **all** items (so placement state is consistent), but only
baseline-aligned items contribute baselines. Container baselines are propagated from the chosen
`BaselineAccumulator` (`StackingBaselineAccumulator` for columns, `GridBaselineAccumulator` for
rows).

---

## 6. Alignment & Sizing Output

- **Self-alignment**: `justify-self`/`align-self` applied per item via `AlignmentOffset()`. Baseline
  alignment is supported **only in the grid axis** (one track dimension); the stacking axis uses
  `AxisEdge::kStart`.
- **Content alignment**: `align-content`/`justify-content` along the stacking axis is a single-subject
  problem — `AlignContentOffset()` collapses to start/center/end/baseline (distributed values fall
  back) per `#alignment`, applied via `container_builder_.MoveChildrenInDirection()`.
- **Intrinsic size**: For **column** grid-lanes the block-size = stacking-axis size (max running
  position minus the trailing gap). For **row** grid-lanes `intrinsic_block_size_` comes from the
  grid-axis `track_collection.CalculateSetSpanSize()` (captured before any re-run). Final block-size
  via `ComputeBlockSizeForFragment`.
- **Out-of-flow**: OOF children are collected during `ConstructGridItems` and placed after intrinsic
  size is known (`PlaceOutOfFlowItems`); they do not contribute to intrinsic size.

---

## 7. Subgrid Interaction

Grid-lanes supports subgrids **only in the grid axis** (the stacking axis has no tracks). Key points:
- `GridLanesNode::ConstructGridItems(parent_is_auto_placed)` — if the grid-lanes container is itself
  an auto-placed subgrid, **all** its children are marked `is_auto_placed` (their final position in
  the ancestor's tracks is unknown).
- Placement happens **after** track sizing in grid-lanes, so the placement cache is less relied upon
  than in grid (`must_invalidate_placement_cache` is accepted but unused — see header comment).
- Auto-placed subgrids get a temporary span at the container start during sizing
  (`ComputeSetIndicesForSubgrid`), reset to indefinite at placement
  (`FinalizeItemSpanAndGetMaxPosition`), then re-inherited/re-sized once the resolved position is
  known (`RebuildSubgridLayoutDataForResolvedPlacement`). The sizing tree's `GridLayoutData` is the
  single source of truth; a fresh `GridLayoutSubtree` is finalized on demand during placement.
- Subgridded item contributions account for the surrounding subgrid's extra margins / gutter-size
  delta (`#subgrid-size-contribution` treats the subgrid as empty in the subgridded axis).
- **Nested subgrids** are explicitly flagged as not-yet-correct (TODO in `RunGridLanesPlacementPhase`).

---

## 8. What It Reuses From `core/layout/grid/`

Grid-lanes is built **on top of** the grid implementation. Shared (reused) machinery:

| Reused type / helper | From | Used for |
|----------------------|------|----------|
| `GridItems`, `GridItemData`, `GridItemData::VirtualItemContributions` | `grid/grid_item.h` | Item model + per-item contribution sizes |
| `GridLineResolver` | `grid/grid_line_resolver.h` | `ResolveGridPositionsFromStyle`, auto-repetitions, explicit track count |
| `GridSizingTree`, `GridSizingSubtree`, `GridLayoutSubtree`, `GridLayoutTree` | `grid/grid_sizing_tree.*`, `grid_subtree.h` | Sizing/layout tree (incl. subgrid) |
| `GridLayoutData`, `GridSizingTrackCollection`, `GridLayoutTrackCollection`, `GridRangeBuilder` | `grid/grid_data.h`, `grid_track_collection.*` | Track collections + ranges (grid axis) |
| `GridTrackSizingAlgorithm` | `grid/grid_track_sizing_algorithm.*` | `CalculateGutterSize`, `ComputeFirstSetGeometry`, track sizing |
| `GridPlacementData`, `GridSpan`, `GridArea`, `GridTrackSizingDirection`, `BaselineGroup` | `grid/grid_placement.*`, `style/grid_area.h` | Placement/span model |
| `BuildGridSizingTree` / `BuildGridSizingSubtree` templates | `grid/grid_layout_utils.cc` | **Explicitly instantiated** for `GridLanesLayoutAlgorithm` |
| `GridBaselineAccumulator`, `BaselineAccumulator` | `grid/grid_baseline_accumulator.h` | Row grid-lanes container baselines |
| `LayoutGrid` static helpers | `grid/layout_grid.*` | DevTools data extraction in `LayoutGridLanes` |

Grid-lanes-**specific** additions: `GridLanesLayoutAlgorithm`, `GridLanesRunningPositions`,
`GridLanesItemGroup`/`VirtualItems`, `GridLanesNode`, `GridLanesDirection`,
`StackingBaselineAccumulator`, `LayoutGridLanes`, and the running-positions placement model. There is
**no** dedicated paint code — grid-lanes produces ordinary `PhysicalBoxFragment`s painted by the
normal block painting path.
