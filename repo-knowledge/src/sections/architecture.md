# Blink Renderer Architecture (CSS Layout Focus)

## High-Level Pipeline

Style -> Layout -> Paint -> Compositing

1. **CSS Parsing** (`core/css/`): CSS text -> CSSOM / parsed values
2. **Style Resolution** (`core/style/`): Parsed values -> `ComputedStyle` objects
3. **Layout** (`core/layout/`): `ComputedStyle` + DOM -> fragment tree with geometry
4. **Paint** (`core/paint/`): Fragment tree -> display lists / paint operations

## Directory Hierarchy

```
blink/renderer/
  core/       -- Tightly-coupled Web Platform (layout, style, CSS, paint, DOM)
  modules/    -- Self-contained features (crypto, WebRTC, etc.)
  platform/   -- Lower-level utilities (WTF containers, geometry, fonts)
```

Dependencies flow downward: `controller -> extensions -> modules -> core -> platform`.

## LayoutNG Architecture (the current layout engine)

### Key Abstractions

| Concept | Class | Role |
|---------|-------|------|
| Input node | `BlockNode` | Wraps a `LayoutBox`, provides access to `ComputedStyle` and children |
| Layout constraints | `ConstraintSpace` | Available size, writing mode, fragmentation context |
| Algorithm | `LayoutAlgorithm<>` | Templated base; subclassed per display type |
| Output | `LayoutResult` | Contains the resulting `PhysicalFragment` |
| Fragment | `PhysicalBoxFragment` | Physical geometry output; stored in fragment tree |
| Builder | `BoxFragmentBuilder` | Accumulates children/geometry during layout, produces fragment |

### Data Flow for a Flex Container

```
FlexLayoutAlgorithm receives:  BlockNode + ConstraintSpace
  |
  +-- ConstructAndAppendFlexItems() -> builds FlexItem vector
  |     (reads ComputedStyle for flex-grow/shrink/basis, alignment)
  |
  +-- BreakFlexItemsIntoLines() -> FlexLineBreaker splits into FlexLine[]
  |
  +-- LineFlexer::Run() per line -> resolves flexed_content_size
  |
  +-- PlaceFlexItems() -> computes offsets, populates FlexItemData
  |
  +-- GiveItemsFinalPositionAndSize() -> final layout of each child
  |     (calls child.Layout() with per-item ConstraintSpace)
  |
  +-- Returns LayoutResult containing PhysicalBoxFragment
        (with optional GapGeometry for gap decorations)
```

### Fragment Tree (not LayoutObject tree)

Paint and hit-testing traverse the **physical fragment tree**, not the `LayoutObject` tree. This is critical for fragmentation (multicol, printing) where one `LayoutObject` may produce multiple fragments.

## Flex Layout Key Classes (`core/layout/flex/`)

| File | Purpose |
|------|---------|
| `flex_layout_algorithm.{h,cc}` | Main flex algorithm; inherits `LayoutAlgorithm<BlockNode, BoxFragmentBuilder, BlockBreakToken>` |
| `flex_item.h` | `FlexItem` struct: per-item data (flex factors, sizes, margins, alignment) |
| `flex_line.h` | `FlexLine` struct + `FlexItemData` (fragmentation subset); `FlexLineVector` = `HeapVector<FlexLine, 1>` |
| `flex_line_breaker.h` | Splits items into lines (greedy or balanced) |
| `line_flexer.h` | Resolves `flexed_content_size` per line using grow/shrink |
| `flex_child_iterator.h` | Iterates children in `order`-sorted sequence |
| `flex_gap_accumulator.h` | Builds `GapGeometry` incrementally during item placement |
| `layout_flexible_box.h` | `LayoutFlexibleBox` : `LayoutBlock` -- the LayoutObject for flex containers |

## Gap Decorations Architecture (`core/layout/gap/`)

The **Main-Cross (MC) Gap Geometry** model stores gap positions compactly:

- **MainGap**: Gap between flex lines (row-gap in row-flex, column-gap in column-flex)
- **CrossGap**: Gap between items within a line
- **GapGeometry** (GC'd): Stored on `PhysicalBoxFragment`, consumed by `GapDecorationsPainter`
- Intersection points are computed on-demand during paint, not stored

Layout populates `GapGeometry` via `FlexGapAccumulator`; paint reads it via `GapDecorationsPainter`.

## Style Layer

`ComputedStyle` is the central style object. Generated partly from `computed_style_extra_fields.json5`. Access gap properties via `ColumnGap()`, `RowGap()`, and gap decoration properties like `RowRuleStyle()`.

## Feature Flags

New features use `RuntimeEnabledFeatures`. In tests, toggle with scoped helpers:
```cpp
ScopedCSSGapDecorationForTest scoped_gap_decoration(true);
```
