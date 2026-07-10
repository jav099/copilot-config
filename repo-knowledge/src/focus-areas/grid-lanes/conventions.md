# Grid-Lanes Conventions

## Naming Patterns

| Convention | Examples |
|-----------|----------|
| In-tree feature name | **grid-lanes** (CSS Grid 3 "masonry"); commit messages tag `[Masonry]`; final name unresolved (csswg-drafts#12803) |
| Core types | `GridLanesLayoutAlgorithm`, `GridLanesRunningPositions`, `GridLanesNode`, `LayoutGridLanes`, `GridLanesItemGroup`, `GridLanesDirection`, `StackingBaselineAccumulator` |
| Grid reuse types (no `Lanes`) | `GridItems`, `GridItemData`, `GridSizingTree`, `GridLayoutData`, `GridLineResolver`, `GridSpan`, `GridArea`, `GridPlacementData` |
| Axis terminology | **grid axis** (has tracks) vs **stacking axis** (masonry/flow axis, no tracks) |
| Direction params | `GridTrackSizingDirection` (`kForColumns`/`kForRows`) — reused from grid; the **grid axis** is `Style().GridLanesTrackSizingDirection()` |
| Style accessors | `GridLanesTrackSizingDirection()`, `IsReverseGridLanesFillDirection()`, `IsReverseGridLanesTrackDirection()`, `IsGridLanesPackDense()`, `IsDisplayGridLanes()`, `HasGridTrackAxis()` |
| Masonry concepts | `TrackOpening`, `running position`, `auto_placement_cursor_`, `tie_threshold_` (flow-tolerance), `max-position`, virtual items / item groups |
| Methods (lanes-specific) | `*GridLanes*` prefix: `PlaceGridLanesItems`, `RunGridLanesPlacementPhase`, `BuildVirtualGridLanesItems`, `MeasureVirtualGridLanesItems`, `ComputeGridLanesSizingTree`, `ComputeGridLanesGeometry` |
| CSS property naming | `grid-lanes` (shorthand), `grid-lanes-direction`, `grid-lanes-pack`, `flow-tolerance` |
| File naming | Snake case under a dedicated dir: `grid_lanes_layout_algorithm.cc`, `grid_lanes_running_positions.h`, `layout_grid_lanes.cc` |
| Author marker | TODOs reference `almaher` (owner), `celestepan`, `yanlingwang` |

## File Organization

```
core/
  css/
    css_value_keywords.json5         # "grid-lanes", "inline-grid-lanes" display keywords
    css_properties.json5             # display values + grid-lanes-direction/-pack, grid-lanes shorthand, flow-tolerance
    properties/
      css_parsing_utils.cc           # ConsumeFlowTolerance (~7907); intrinsic auto-repeat parse flag-gate (~7186)
      longhands/longhands_custom.cc  # display:grid-lanes/inline-grid-lanes flag gating (~3687, 3704); EDisplay mapping
      shorthands/shorthands_custom.cc# grid-lanes shorthand; IsLayoutGridLanes() check (~4002)
    resolver/style_adjuster.cc       # EDisplay::kInlineGridLanes adjustment (~281, 320)
  style/
    computed_style.h                 # GridLanesTrackSizingDirection(), IsDisplayGridLanes(), HasGridTrackAxis() (~1192-1239, 2722)
    grid_lanes_direction.h?          # (NO) — lives under layout/ (see below)
    flow_tolerance.h                 # FlowTolerance style value type
    grid_enums.h                     # GridPositionSide; GridTrackSizingDirection {kForColumns,kForRows}
                                     #   (EGridLanesPack {kNormal,kDense} is code-generated into computed_style_base_constants.h; used at computed_style.h:1227)
  layout/
    block_node.cc                    # DISPATCH: IsLayoutGridLanes() -> GridLanesLayoutAlgorithm (~173)
    layout_object.cc                 # FACTORY: EDisplay::kGridLanes -> LayoutGridLanes (~424)
    layout_object.h                  # IsLayoutGridLanes() (~937), IsLayoutGridOrGridLanes() (~941)
    layout_input_node.h              # IsGridLanes() (~90)
    length_utils.cc                  # ResolveFlowToleranceForGridLanes() / ResolveFlowToleranceLength() (~1376-1398)
    out_of_flow_layout_part.cc       # uses GridLanesLayoutAlgorithm::ComputeOutOfFlowItemContainingRect (~825)
    build.gni                        # source list (219-229) + test (763)
    grid/                            # REUSED machinery (track sizing, line resolver, sizing tree, subgrid, baselines)
      grid_layout_utils.cc           # BuildGridSizingTree<GridLanesLayoutAlgorithm> instantiations (~790, 827, 858)
    grid_lanes/                      # GRID-LANES SPECIFIC
      grid_lanes_layout_algorithm.h/.cc   # core algorithm (orchestration, sizing, placement)
      grid_lanes_running_positions.h/.cc  # masonry placement engine (running positions, track openings)
      grid_lanes_item_group.h             # item-group / VirtualItems (track-sizing-performance)
      grid_lanes_node.h/.cc               # BlockNode extension (item construction, grouping, subgrid)
      grid_lanes_direction.h              # GridLanesDirection / GridLanesOrientation
      layout_grid_lanes.h/.cc             # LayoutObject + DevTools data extraction
      stacking_baseline_accumulator.h     # stacking-axis container baselines
      grid_lanes_layout_algorithm_test.cc # C++ unit tests
  inspector/
    inspector_highlight.cc           # BuildGridInfoForGridLanes() (IsLayoutGridLanes() ~1914)
```

## CSS Property Definitions (in `css_properties.json5`)

| Property | Shape | Notes |
|----------|-------|-------|
| `display: grid-lanes` / `inline-grid-lanes` | keyword | Added to `display` value set (~3423); parse gated by `CSSGridLanesLayoutEnabled()` |
| `grid-lanes-direction` | `external`, `type_name: "GridLanesDirection"`, `converter: ConvertGridLanesDirection`, `getter: GetGridLanesDirection` | Syntax `normal \| [ row \| column ] [ fill-reverse \|\| track-reverse ]?`; `invalidate: [layout, paint]`; `runtime_flag: CSSGridLanesLayout` |
| `grid-lanes-pack` | `keyword`, `keywords: [normal, dense]`, default `normal` | Maps to `EGridLanesPack`; `runtime_flag: CSSGridLanesLayout` |
| `grid-lanes` (shorthand) | longhands `grid-template-areas, grid-template-columns, grid-template-rows, grid-lanes-direction` | `layout_dependent: true`; `runtime_flag: CSSGridLanesLayout` (~9601) |
| `flow-tolerance` | `external`, `type_name: "FlowTolerance"`, `keywords: [normal, infinite]`, default `normal`, `interpolable` | Controls the tie band for line selection; `percentages_depend_on_used_value`; `runtime_flag: CSSGridLanesLayout` (~3663) |

`grid-template-columns`/`grid-template-rows` are shared with grid (the grid axis uses one of them);
`grid-lanes-direction: normal` resolves the grid axis from whichever template is set.

## Feature Flags

| Flag | Status | Public | Location | Runtime check |
|------|--------|--------|----------|---------------|
| `CSSGridLanesLayout` | `experimental` | yes | `runtime_enabled_features.json5` (~line 1661) | `RuntimeEnabledFeatures::CSSGridLanesLayoutEnabled()` |

Notes:
- No declared `depends_on` / `implied_by` for this flag (unlike `CSSGapDecoration`).
- Because the status is `experimental`, the flag is **on by default in `blink_unittests`** (the test
  environment calls `WebRuntimeFeatures::EnableExperimentalFeatures(true)`), and **off** in stable
  Chrome. See testing.md.
- Single guard point conceptually: the **CSS parser** rejects `display: grid-lanes` and the
  `grid-lanes-*` / `flow-tolerance` properties when disabled, so no `LayoutGridLanes` is ever
  created and the layout algorithm is never reached. There is no separate paint guard for grid-lanes
  itself; **gap decorations**, however, ride their own shared paint path under the independent
  `CSSGapDecoration` flag and are not wired up for grid-lanes yet (see architecture.md §9).

## How To: Enable / Run Grid-Lanes

- **In a running Chrome:** launch with `--enable-blink-features=CSSGridLanesLayout`, or enable
  `chrome://flags` "Experimental Web Platform features" (which turns on all `experimental` flags).
- **In a web test:** add `// META: ...` is not needed; instead the canonical WPT tests live under a
  flag-required tree and the virtual suite `disable-css-grid-lanes-layout` runs the parsing tests
  with `--disable-blink-features=CSSGridLanesLayout` to verify the off state.
- **In a C++ unit test:** nothing special — `blink_unittests` enables experimental features, so
  `display: grid-lanes` parses. (There is **no** `ScopedCSSGridLanesLayoutForTest`.)

## How To: Trace an Item's Placement

1. Confirm the **grid axis**: `Style().GridLanesTrackSizingDirection()` (`kForColumns` => stacking
   axis is block/rows; `kForRows` => stacking axis is inline/columns).
2. Item span in the grid axis is resolved in `GridLanesNode::ConstructGridItems` ->
   `AdjustGridItemSpan` (indefinite span => `is_auto_placed = true`).
3. Track sizes come from the virtual-item path (`BuildVirtualGridLanesItems` ->
   `MeasureVirtualGridLanesItems` -> grid track sizing).
4. Stacking-axis position: in `RunGridLanesPlacementPhase`,
   `GridLanesRunningPositions::FinalizeItemSpanAndGetMaxPosition` chooses the line
   (`GetFirstEligibleLine` for auto-placed) and returns the span's **max-position**.
5. For `grid-lanes-pack: dense`, also inspect
   `GetEligibleTrackOpeningAndUpdateGridLanesItemSpan` / `AccumulateTrackOpeningsToAccommodateItem`.
6. The item is laid out, aligned (`AlignmentOffset`), and added via `container_builder_.AddResult`;
   running positions advance in `UpdateRunningPositionsForSpan`, and the cursor in
   `UpdateAutoPlacementCursor`.
7. For DevTools geometry, `LayoutGridLanes` exposes track positions/sizes via the cached
   `GridPlacementData` and static `LayoutGrid` helpers.

## How To: Add a Grid-Lanes CSS Property

1. Define it in `css_properties.json5` with `runtime_flag: "CSSGridLanesLayout"` and appropriate
   `invalidate` targets (most grid-lanes properties use `["layout", "paint"]`).
2. Add parsing (`css_parsing_utils.cc` / `longhands_custom.cc`) and, if list/struct-valued, a
   converter in `style_builder_converter.cc` + an `include_paths` to the style type header.
3. Add the `ComputedStyle` accessor (mirror `IsGridLanesPackDense()` / `GetGridLanesDirection()`).
4. Consume it in the layout algorithm or running-positions engine (e.g. a new packing/direction
   mode threads through `GridLanesRunningPositions`' constructor flags).
5. Add WPT parsing tests under `external/wpt/css/css-grid/grid-lanes/tentative/parsing/` and
   behavior tests under the relevant `grid-lanes/` subdir; add C++ coverage in
   `grid_lanes_layout_algorithm_test.cc` (see testing.md).
