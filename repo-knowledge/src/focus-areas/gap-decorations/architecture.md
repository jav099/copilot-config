# Gap Decorations Architecture

## Three-Pillar Model: Style -> Layout -> Paint

### Data Flow Summary

```
CSS Text
  | (Parsing)
CSSValueList / CSSRepeatValue
  | (Style Resolution: ConvertGapDecorationColorDataList, etc.)
GapDataList<T> stored on ComputedStyle
  | (Layout: grid/flex/column algorithm)
GapGeometry (MainGaps + CrossGaps) stored on PhysicalBoxFragment
  | (Paint: BoxFragmentPainter -> GapDecorationsPainter)
GapDataListIterator traverses GapDataList with known gap_count
  |
BoxBorderPainter::DrawBoxSide() renders each segment
```

---

## 1. Style Pillar (`core/style/` + `core/css/`)

Resolves CSS gap decoration property values into computed style data structures.

### Core Data Structures

- **`GapData<T>`** (`core/style/gap_data.h`): Generic container holding either a single value of type `T` or a pointer to a `ValueRepeater<T>`. Templated for `StyleColor`, `EBorderStyle`, and `int` (widths). Uses `DISALLOW_NEW()` -- always inline-stored.

- **`ValueRepeater<T>`** (`core/style/gap_data.h`): `GarbageCollected`. Stores a vector of repeated values and an optional repeat count. `std::nullopt` repeat count = **auto repeater** (expands to fill remaining slots). Defined count = **integer repeater** (repeats exactly N times).

- **`GapDataList<T>`** (`core/style/gap_data_list.h`): Ordered list of `GapData<T>` entries. Uses `DISALLOW_NEW()`. Static factory defaults:
  - `DefaultGapColorDataList()` -> `currentColor`
  - `DefaultGapWidthDataList()` -> `3` (px, matching `medium` border width)
  - `DefaultGapStyleDataList()` -> `none`

- **`GapDataListIterator<T>`** (`core/style/gap_data_list.h`): Lazy, non-expanding iterator that traverses a `GapDataList` given a known `gap_count`. Segments into three logical regions: **Leading** (fixed data before auto-repeater), **Auto** (auto-repeating segment), **Trailing** (fixed data after auto-repeater). Avoids fully expanding the list -- critical for performance.

### Property Utilities

**`CSSGapDecorationUtils`** (`core/css/css_gap_decoration_property_utils.h/.cc`): Static utility class bridging CSS and layout:

| Method | Purpose |
|--------|---------|
| `GetLonghandProperty()` | Maps direction + type enum to `CSSPropertyID` |
| `AddProperties()` | Adds width/style/color to shorthand expansion |
| `GetExpandedGapDataList()` | Expands integer repeaters (not auto) for intermediate processing |
| `GetExpandedWidths()` | Fully expands `GapDataList<int>` using `GapDataListIterator` |
| `ResolveRuleBreakValue()` | Resolves `normal` to container-specific values |
| `ResolveRuleVisibilityItemsValue()` | Resolves `normal` based on container type |
| `IsRuleSegmentVisible()` | Determines segment visibility based on `GapSegmentState` |
| `HasOverlapJoin()` | Checks if any inset property uses `overlap-join` |
| `BoxSideFromDirection()` | Maps track direction to physical `BoxSide` for painting |
| `RuleColorMaybeDependsOnCurrentColor()` | Whether a rule-color list may depend on `currentColor` (style/invalidation optimization) |
| `GetExpandedCSSValueListForGapData()` | Expands integer (non-auto) repeaters in a gap-data `CSSValueList` (color/width/style) for serialization; uses `StyleResolverState` |
| `HasCrossGapSegment()` | Whether a present cross-direction segment exists at an intersection (grid, `rule-visibility-items: between`) |

### CSS Properties

| Category | Column Properties | Row Properties |
|----------|-------------------|----------------|
| **Core** | `column-rule-color`, `column-rule-style`, `column-rule-width` | `row-rule-color`, `row-rule-style`, `row-rule-width` |
| **Break** | `column-rule-break` | `row-rule-break` |
| **Cap Inset** | `column-rule-inset-cap-start`, `column-rule-inset-cap-end` | `row-rule-inset-cap-start`, `row-rule-inset-cap-end` |
| **Junction Inset** | `column-rule-inset-junction-start`, `column-rule-inset-junction-end` | `row-rule-inset-junction-start`, `row-rule-inset-junction-end` |
| **Visibility** | `column-rule-visibility-items` | `row-rule-visibility-items` |
| **Overlap** | `rule-overlap` (shared) | |

**Shorthands:**
- `column-rule` -> `column-rule-width`, `column-rule-style`, `column-rule-color`
- `row-rule` -> `row-rule-width`, `row-rule-style`, `row-rule-color`
- `rule-color` -> `column-rule-color`, `row-rule-color`
- `rule-width` -> `column-rule-width`, `row-rule-width`
- `rule-style` -> `column-rule-style`, `row-rule-style`
- `rule-break` -> `row-rule-break`, `column-rule-break`
- `rule-visibility-items` -> `column-rule-visibility-items`, `row-rule-visibility-items`
- `rule-overlap` is a single (non-shorthand) longhand property
- Inset shorthands: `rule-inset-cap`, `rule-inset-junction`, `rule-inset-start`, `rule-inset-end`, `rule-inset` (all four insets, both directions); per-direction `column-rule-inset` / `row-rule-inset`, `column-rule-inset-cap` / `column-rule-inset-junction` (+ row), and side groupings `column-rule-inset-start` / `column-rule-inset-end` (cap+junction for one side)

### Computed Style Integration (`core/style/computed_style.h`)

- Setters call `SetMaybeHasGapDecorations()` (bit flag) for early-out optimization
- `HasGapRule()` -> checks `MaybeHasGapDecorations()` + `HasColumnRule()` + `HasRowRule()`
- `HasColumnRule()` / `HasRowRule()` -> checks width > 0, non-transparent color, visible style
- `HasVisualOverflowingEffect()` includes `HasGapRule()` for ink overflow computation

---

## 2. Layout Pillar (`core/layout/gap/`)

Builds the **Main-Cross (MC) Gap Geometry** model -- a compact geometry representation for painting gap decorations.

### MC Model Design (from `layout/gap/README.md`)

The MC model avoids "rows" and "columns" terminology:
- **Main Gaps** -- gaps along the primary axis being traversed
- **Cross Gaps** -- gaps along the orthogonal axis that intersect main gaps
- **Intersections** -- computed on-demand where main and cross gaps meet, or at container content edges

### Key Classes

**`GapGeometry`** (`gap_geometry.h/.cc`): `GarbageCollected`. Central geometry class storing:
- `main_gaps_` -- `Vector<MainGap>`
- `cross_gaps_` -- `Vector<CrossGap>`
- `inline_gap_size_`, `block_gap_size_` -- gutter sizes
- `content_inline_start_/end_`, `content_block_start_/end_` -- content box edges
- `container_type_` -- enum: `kGrid`, `kFlex`, `kMultiColumn`
- `main_direction_` -- `GridTrackSizingDirection` (`kForRows` or `kForColumns`)
- `flex_cross_gap_line_data_` -- optional per-line data for flex
- `main_gap_running_index_` -- **mutable** state for flex cross-gap computation at paint time

Key methods:
- `GenerateIntersectionListForGap()` -- dispatches to main vs cross, per container type
- `IsCapIntersection()` -- (formerly `IsEdgeIntersection()`) different logic per container type
- `ComputeInsetStart/End()` -- resolves inset values including `overlap-join`
- `GetCrossWidthForIntersection()` -- cross gap width at intersection
- `GetIntersectionGapSegmentState()` -- residual lookup (binary search) used only for certain overlap-join cross-gap-state cases. The main paint path reads precomputed per-intersection states O(1) via `GapSegmentStateCursor` (built in a single forward pass during intersection generation; see crbug.com/440123087).
- `ComputeInkOverflowForGaps()` -- inflates content bounds by decoration half-thickness
- `AdjustCrossGapsRangesForFragmentation()` -- adjusts ranges for fragmented containers

**`MainGap`** (`main_gap.h`): Gap in the primary axis.
- `gap_offset_` -- midpoint offset
- `range_of_cross_gaps_before_/after_` -- `CrossGapRange` indices into `cross_gaps_`
- `gap_segment_state_ranges_` -- optional blocked/empty ranges (from spanning items)
- `spanner_main_gap_type_` -- `kStart`/`kEnd`/`kNone` (multicol spanners create 2 main gaps)

**`CrossGap`** (`cross_gap.h`): Gap along the orthogonal axis.
- `gap_logical_offset_` -- `LogicalOffset` (both inline and block)
- `edge_state_` -- `EdgeIntersectionState` (flex-specific: whether gap borders container edge)
- `gap_segment_state_ranges_` -- optional blocked/empty ranges

**`CrossGapRange`** (`cross_gap.h`): Stores `[start_index_, end_index_]` range within `cross_gaps_` vector.

**`GapIntersection`** (`gap_intersection.h`): Intersection point with optional `ExtraIntersectionState`:
- `offset_` -- physical offset
- `extra_state_` -- flex-only: `is_above_main_gap`, `overlap_state` (`kNone`/`kWindowOpen`/`kWindowClose`), `main_gap_index`

**`GapSegmentState` / `GapSegmentStateRange` / `GapSegmentStateCursor` / `GapSegmentStateAggregator`** (`gap_utils.h/.cc`):
- `GapSegmentState` -- bitmask: `kNone`, `kEmptyBefore`, `kEmptyAfter`, `kBlocked` (default-constructs to `kEmptyBoth`)
- `GapSegmentStateAggregator` -- processes grid items to build per-cell occupancy, finalizes into ranges per gap
- `GapSegmentStateCursor` -- forward-pass O(1) reader over `GapSegmentStateRanges`; each `GapIntersection` now carries a precomputed `segment_state_`, populated when the intersection list is generated (replacing the old paint-time binary search).

### Per-Container GapGeometry Building

| Container | Layout Algorithm File | Build Method | Main Direction | Cross Gap Association |
|-----------|----------------------|--------------|----------------|----------------------|
| **Grid** | `grid/grid_layout_algorithm.cc` | Inner `GapAccumulator` class | `kForRows` (rows are main) | Shared across all main gaps (aligned) |
| **Flex** | `flex/flex_layout_algorithm.cc` via `FlexGapAccumulator` | `FlexGapAccumulator::BuildGapGeometry()` | `kForRows` (row-flex) or `kForColumns` (col-flex) | Per-main-gap ranges (unaligned lines) |
| **Multicol** | `column_layout_algorithm.cc` via `ColumnGapAccumulator` | `ColumnGapAccumulator::BuildGapGeometry()` | `kForRows` | Shared (like grid). Spanners create 2 `MainGap`s |

**Grid:** Gap geometry built in `GridLayoutAlgorithm::PlaceItems()`. Inner `GapAccumulator` builds main/cross gaps from grid tracks. For fragmentation: `full_gap_geometry` computed once, per-fragment geometries created with adjusted offsets.

**Flex:** `FlexGapAccumulator` builds geometry item-by-item. Each main gap tracks its own before/after cross gap ranges. Per-line cross gap data stores effective gap size and cross gap count per line. `SuppressLastMainGap()` handles fragmentation boundaries.

**Multicol:** Built via a dedicated `ColumnGapAccumulator` (`column_gap_accumulator.h/.cc`) driven from `ColumnLayoutAlgorithm`; `BuildGapGeometry()` is called near layout finish. Spanners generate TWO `MainGap`s (`kStart`/`kEnd`) via `AddStart/EndSpannerMainGapIfNeeded()`; spanner main gaps are not painted. `column-wrap: wrap` creates regular main gaps between rows.

### Memory Efficiency

- Grid: ~75% memory reduction vs previous design (which stored all intersections explicitly)
- Flex: >50% memory reduction
- Intersections computed on-demand at paint time, not stored

### GapGeometry Storage

- Stored on `PhysicalBoxFragment` via `PhysicalFragmentRareData::gap_geometry_`
- Set by `BoxFragmentBuilder::SetGapGeometry()`
- `GetGapGeometry()` returns `const GapGeometry*` (or `nullptr`)

---

## 3. Paint Pillar (`core/paint/`)

**`GapDecorationsPainter`** (`gap_decorations_painter.h/.cc`): `STACK_ALLOCATED()`. Constructed from a `PhysicalBoxFragment` reference. Its `Paint(track_direction, paint_info, paint_rect, gap_geometry)` method is called once per axis (`kForRows`/`kForColumns`) by `BoxFragmentPainter`, ordered per `rule-overlap`.

### Paint Algorithm

1. Read computed style: `rule_colors`, `rule_styles`, `rule_widths` from appropriate direction
2. Resolve `rule_break` and `rule_visibility` (container-type-aware)
3. Create `GapDataListIterator`s for width, style, color (lazy iterators with `gap_count`)
4. For flex cross gaps: **reset iterators per flex line** (multi-value lists restart per line)
5. If `overlap-join` active: pre-expand cross-direction rule widths
6. For each gap:
   - Skip multicol spanner `MainGap`s
   - Get color, style, width from iterators
   - Generate intersection list on-demand via `GenerateIntersectionListForGap()`
   - Walk intersection pairs with `AdjustIntersectionIndexPair()`:
     - `ShouldMoveIntersectionStartForward()` -- advances past blocked/invisible/overlap-open
     - `ShouldMoveIntersectionEndForward()` -- extends based on rule-break/visibility
   - Compute insets (edge vs interior, `overlap-join`)
   - Build `LogicalRect` -> `PhysicalRect` -> paint via `BoxBorderPainter::DrawBoxSide()`

### Paint Integration (`BoxFragmentPainter`)

- `PaintGapDecorations()` called from `PaintObject()` after background + borders
- Guarded by: `box_fragment_.GetGapGeometry() && !paint_info.ShouldSkipGapDecorations() && RuntimeEnabledFeatures::CSSGapDecorationEnabled()`
- **Paint order** via `rule-overlap`:
  - `row-over-column` (default): columns first, then rows (rows ON TOP)
  - `column-over-row`: rows first, then columns
- **Scrolling containers**: Skipped in border box space, painted in contents space

### Ink Overflow

- `PhysicalBoxFragment::ComputeInkOverflow()` calls `gap_geometry->ComputeInkOverflowForGaps(writing_direction, container_size, inline_thickness, block_thickness, outsets)`
- Inflates content bounds by half the max decoration thickness in each axis (`MaxGapDecorationsWidth()`)
- Additionally accounts for negative cap/junction insets that push decorations past the content box, via per-side `GapDecorationInkOutsets` computed by `MaxGapDecorationInsetOutset()` (overlap-join insets are excluded, since their outward extension is already bounded by the rule's thickness inflation). `GetCrossingGapSize()` supplies the percentage basis for junction insets.
