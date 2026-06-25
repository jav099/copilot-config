# Gap Decorations Conventions

## Naming Patterns

| Convention | Examples |
|-----------|----------|
| Gap geometry types | `MainGap`, `CrossGap`, `GapGeometry`, `GapIntersection` |
| State types | `GapSegmentState`, `GapSegmentStateRange`, `GapSegmentStateRanges`, `BlockedStatus` |
| Aggregator/Builder | `GapSegmentStateAggregator`, `FlexGapAccumulator`, inner `GapAccumulator` (grid) |
| Painter | `GapDecorationsPainter` |
| CSS utility | `CSSGapDecorationUtils` (static-only class) |
| Direction params | `GridTrackSizingDirection` (`kForRows`, `kForColumns`) -- reused from grid, even for flex/multicol |
| Main/Cross terminology | "Main" = primary axis, "Cross" = orthogonal axis (avoids row/column ambiguity) |
| Property naming | `{column,row}-rule-{color,style,width,break,inset-cap-{start,end},inset-junction-{start,end},visibility-items}` |
| File naming | Snake case: `gap_geometry.h`, `gap_decorations_painter.cc`, `flex_gap_accumulator.h` |

## File Organization

```
core/
  css/
    css_gap_decoration_property_utils.h/.cc     # CSS <-> Layout bridge utilities
    css_properties.json5                         # Property definitions
    properties/longhands/longhands_custom.cc     # Per-property parse/compute
    properties/shorthands/shorthands_custom.cc   # Shorthand parse
    properties/css_parsing_utils.cc              # Parsing helpers
    properties/computed_style_utils.cc           # Computed value serialization
    resolver/style_builder_converter.cc          # Value conversion
    css_repeat_value.h                           # CSSRepeatValue for repeat()
  style/
    gap_data.h                # GapData<T>, ValueRepeater<T>
    gap_data_list.h           # GapDataList<T>, GapDataListIterator<T>
    computed_style.h          # Style accessors: ColumnRuleColor(), etc.
    grid_enums.h              # GridTrackSizingDirection
  layout/
    gap/                      # Core gap geometry model
      README.md               # Design documentation
      gap_geometry.h/.cc      # GapGeometry class
      main_gap.h/.cc          # MainGap class
      cross_gap.h/.cc         # CrossGap class
      gap_intersection.h      # GapIntersection + OverlapWindowState
      gap_utils.h/.cc         # GapSegmentState, Aggregator
      resources/              # Diagrams (PNG) for README
    grid/
      grid_layout_algorithm.cc    # Grid gap geometry (inner GapAccumulator)
    flex/
      flex_gap_accumulator.h/.cc  # Flex gap geometry building
      flex_layout_algorithm.cc    # FlexGapAccumulator usage
    column_layout_algorithm.cc       # Multicol layout (drives ColumnGapAccumulator)
    column_gap_accumulator.h/.cc      # Multicol gap geometry building
    physical_box_fragment.h/.cc   # GapGeometry storage + ink overflow
    box_fragment_builder.h        # SetGapGeometry()
  paint/
    gap_decorations_painter.h/.cc   # Gap decoration painting
    box_fragment_painter.cc         # PaintGapDecorations() integration
```

## Property Definitions (in `css_properties.json5`)

- **Type**: `field_template: "external"` with `type_name: "GapDataList<T>"`
- **Converter**: `ConvertGapDecorationColorDataList`, `ConvertGapDecorationStyleDataList`, etc. (in `style_builder_converter.cc`)
- **Invalidation**: Most properties use `["paint"]` only (geometry is independent), including `*-rule-break` and `*-rule-visibility-items`. `*-rule-style` uses `["paint", "gap-decorations"]` (a dedicated `gap-decorations` invalidation target declared at css_properties.json5:378). Inset, color, width, overlap properties use `["paint"]`.
- **Default values**: Static factory methods: `GapDataList<StyleColor>::DefaultGapColorDataList()`
- **Runtime flag**: `"CSSGapDecoration"` on all except `column-rule-color/style/width` (legacy multicol)
- **Inset properties**: `field_template: "<length>"`, support `overlap-join` keyword, `ConvertGapDecorationInsetLength` converter, `percentages_depend_on_used_value: true`

## Feature Flags

| Flag | Status | Dependencies | Location |
|------|--------|-------------|----------|
| `CSSGapDecoration` | `stable` | Depends on `CSSGridGapSuppression` | `runtime_enabled_features.json5` (~line 1651) |
| `CSSGridGapSuppression` | `stable` | None | Required base flag |

Runtime check: `RuntimeEnabledFeatures::CSSGapDecorationEnabled()`

## How To: Add a New Gap Decoration Property

1. **Define the property** in `css_properties.json5`:
   - Add both `column-*` and `row-*` variants
   - Set `runtime_flag: "CSSGapDecoration"`
   - Choose `invalidate` targets (`["paint"]` for visual-only, `["layout", "paint"]` for geometry-affecting)
   - If list-valued: use `GapDataList<T>` as `type_name`

2. **Add shorthand** in `css_properties.json5` shorthands section (e.g., `rule-{property}` -> `column-rule-{property}`, `row-rule-{property}`)

3. **Implement parsing** in `longhands_custom.cc` / `shorthands_custom.cc` / `css_parsing_utils.cc`

4. **Add value conversion** in `style_builder_converter.cc`

5. **Add computed style serialization** in `computed_style_utils.cc`

6. **Update `CSSGapDecorationUtils`** if the property affects layout geometry or paint behavior

7. **If property affects geometry**: Update `GapGeometry`, relevant layout algorithm accumulators, and paint code

8. **If property affects paint only**: Update `GapDecorationsPainter::Paint()` to read and apply the new property

9. **Update `CSSGapDecorationPropertyType` enum** in `css_gap_decoration_property_utils.h`

10. **Add WPT tests** for the new property (see testing.md)

## How To: Add Gap Decorations to a New Container Type

1. **Create an accumulator** (or build inline) in the container's layout algorithm that constructs `MainGap`s and `CrossGap`s
2. **Set the `GapGeometry`** on the `BoxFragmentBuilder` via `SetGapGeometry()`
3. **Determine main direction**: `kForRows` or `kForColumns` based on container semantics
4. **Implement intersection generation**: Add a case in `GapGeometry::GenerateMainIntersectionList*()` and `GenerateCrossIntersectionList*()` for the new `ContainerType`
5. **Implement `IsEdgeIntersection()`** for the new container type
6. **Add container-specific resolution** in `CSSGapDecorationUtils::ResolveRuleBreakValue()` and `ResolveRuleVisibilityItemsValue()`
7. **Handle fragmentation** if the container supports it
8. **Add tests**: WPT reftests + C++ unit tests (see testing.md)
