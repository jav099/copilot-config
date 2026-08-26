# Gotchas and Sharp Edges

## Type System

- Prefer Blink/WTF containers for Blink-owned collections. Approved STL value/ownership types such as `std::optional` and `std::unique_ptr` are used as members where appropriate; follow the type-specific Blink/clang-plugin rules rather than a blanket ban on STL members.

- **`LayoutUnit` is fixed-point, not float.** It has sub-pixel precision but can overflow. Be careful with large values and cumulative operations.

- **`HeapVector` vs `Vector`**: Use `HeapVector` when storing GC-traced types (`Member<T>`, types with `Trace()`). Use plain `Vector` for POD types and `LayoutUnit`.

## Memory Model

- **`STACK_ALLOCATED()` classes cannot be stored on the heap.** Layout algorithms, iterators, and painters are stack-only. Don't create `Member<FlexLayoutAlgorithm>`.

- **`DISALLOW_NEW()` structs** (`FlexItem`, `FlexLine`): Must use `WTF_ALLOW_CLEAR_UNUSED_SLOTS_WITH_MEM_FUNCTIONS()` when stored in `HeapVector`. Missing this macro causes build failures.

- **`ClearCollectionScope`**: When you have `HeapVector<FlexItem>` as a member, you may need `ClearCollectionScope` to properly clean up GC-traced members. See the `FlexLayoutAlgorithm` destructor pattern: `flex_items_.clear()`.

## Logical vs Physical

- **Layout operates in logical coordinates** (inline-start/end, block-start/end). Physical coordinates (left/top/right/bottom) are only for paint output.

- **Writing mode gotcha**: In vertical writing modes, "width" maps to block-size, not inline-size. Always think inline/block, not width/height.

- **`PhysicalToFlex` helper**: The flex algorithm has its own coordinate mapping (main/cross axes) on top of logical coordinates. See the `PhysicalToFlex<>` template in `flex_layout_algorithm.cc`.

## Flex Layout Specifics

- **`is_column_` vs writing mode**: A column-direction flex container's main axis is the block axis. Don't confuse `is_column_` (CSS `flex-direction`) with writing mode direction.

- **`FlexItem.base_content_size`** includes scrollbar but NOT border/padding. `FlexItem.main_axis_border_padding` is separate. This split is intentional per the flex sizing algorithm.

- **`hypothetical_content_size`** is clamped: `ClampSizeToMinAndMax(base_content_size)`. The `flexed_content_size` may differ after flex resolution.

- **Auto margins**: Items with auto margins along the main axis get `main_axis_auto_margin_count > 0`. These consume free space before alignment.

## Feature Flags

- **Feature gating is feature-specific.** Check `runtime_enabled_features.json5` and each property's `runtime_flag`. Gap-decoration properties and painting are unflagged at this HEAD; do not add `ScopedCSSGapDecorationForTest`.

- **Multiple relayout passes**: Flex layout may run multiple times (`RelayoutWithNewRowSizes()`, `RelayoutAndBreakEarlier()`). Your code must handle being invoked in subsequent passes. Check `relayout_mode_`.

## Fragmentation

- **Fragmentation changes everything.** `FlexLine` has fragmentation-specific fields (`item_offset_adjustment`, `has_seen_all_children`, `line_items_data`). If your change touches item positioning, consider the fragmentation path (`GiveItemsFinalPositionAndSizeForFragmentation`).

- **Gap suppression during fragmentation**: When an item overflows a fragmentainer, the gap before the next fragmentainer may be suppressed. See `UpdateOffsetAdjustmentForSuppressedRowGap()` and `SuppressLastMainGap()`.

- **Break tokens**: State is carried between fragments via `FlexBreakTokenData`. If you add new per-line or per-item state, consider whether it needs to be on the break token.

## GapGeometry

- **`GapGeometry` is fragment-relative.** Each physical fragment has its own `GapGeometry`. Don't assume one `GapGeometry` covers the entire flex container.

- **Paint-time transient state:** flex/grid-lanes cross-gap ownership is a local forward-only cursor in `GapDecorationsPainter`. `GapGeometry` still has mutable multicol spanner-adjacent state; `InitPaintState()` clears it before every paint.

- **Cross gaps for flex have exactly 2 intersection points** (start and end of the item gap). Grid cross gaps have more. Don't assume the same intersection logic applies to both.

## Common Review Feedback

- Check `OWNERS` before submitting -- flex layout changes need layout team approval.
- Component: `Blink>Layout>Flexbox` (buganizer 1456825)
- Team: `layout-dev@chromium.org`
