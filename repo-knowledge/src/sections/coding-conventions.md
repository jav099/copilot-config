# Coding Conventions (Blink Renderer)

## Naming

- **Classes**: `PascalCase` -- `FlexLayoutAlgorithm`, `BoxFragmentBuilder`
- **Methods**: `PascalCase` -- `ComputeMinMaxSizes()`, `Layout()`
- **Member variables**: `snake_case_` with trailing underscore -- `gap_between_items_`, `is_column_`
- **Local variables**: `snake_case` -- `flex_lines`, `main_axis_free_space`
- **Constants**: `kPascalCase` -- `kIndefiniteSize`, `kNotFound`, `kFragmentNone`
- **Enums**: `kPascalCase` values -- `FlexerState::kMinViolation`, `Phase::kLayout`
- **Booleans**: Descriptive names, often `is_` / `has_` prefix -- `is_column_`, `has_processed_first_line_`

## File Organization

- One class per `.h`/`.cc` pair (generally)
- Header guard format: `THIRD_PARTY_BLINK_RENDERER_CORE_LAYOUT_FLEX_FLEX_LAYOUT_ALGORITHM_H_`
- Copyright header: `// Copyright YYYY The Chromium Authors` (no `(C)`)
- `.cc` files include their own `.h` first, then alphabetical includes

## Include Order

1. Own header (`"...flex_layout_algorithm.h"`)
2. C++ standard library (`<memory>`, `<optional>`)
3. `base/` includes
4. `third_party/blink/renderer/core/...` includes
5. `third_party/blink/renderer/platform/...` includes

## Memory / Object Lifecycle

- **`STACK_ALLOCATED()`**: For objects that live only on the stack (algorithms, iterators, painters). No pointers stored beyond scope.
- **`DISALLOW_NEW()`**: For structs stored inline in vectors/containers (e.g., `FlexItem`, `FlexLine`). Cannot be heap-allocated individually.
- **`GarbageCollected<T>`**: For long-lived objects traced by Oilpan (`GapGeometry`).
- **`WTF_ALLOW_CLEAR_UNUSED_SLOTS_WITH_MEM_FUNCTIONS()`**: Required macro at namespace scope for `DISALLOW_NEW` types stored in `HeapVector`.
- **`Member<T>`**: GC-traced pointer (like `shared_ptr` for Oilpan).
- **`Trace()` method**: Required for any class holding `Member<>` or GC'd references.

## Blink-Specific Types (NOT STL)

| Use | Instead of |
|-----|-----------|
| `WTF::Vector`, `HeapVector` | `std::vector` |
| `WTF::HashMap` | `std::unordered_map` |
| `blink::String`, `AtomicString` | `std::string` |
| `KURL` | `GURL` |
| `LayoutUnit` | `int`, `float` for layout dimensions |
| `LogicalOffset`, `PhysicalOffset` | Raw coordinate pairs |
| `BoxStrut`, `PhysicalBoxStrut` | Margin/padding/border structs |

STL types are allowed at API boundaries or as local variables, but **never as member variables** in Blink classes.

## Layout-Specific Patterns

- **Logical vs Physical coordinates**: Layout operates in **logical** space (inline/block). Physical coordinates are used for paint. Convert via `WritingModeConverter`.
- **`LayoutUnit`**: Fixed-point type for sub-pixel precision. Use instead of `int`/`float` for all layout dimensions.
- **`const` correctness**: Algorithm output methods return `const LayoutResult*`. Fragment builders are mutable during construction.
- **`[[unlikely]]`**: Used for rare code paths (e.g., fragmentation checks).

## Const Members in Data Structs

`FlexItem` uses many `const` members set in the constructor. Mutable fields (`flexed_content_size`, `state`) are explicitly non-const and documented.

## DCHECK / CHECK

- `DCHECK()` for debug-only assertions (stripped in release)
- `CHECK()` for release-mode assertions (crashes if violated)
- `NOT_DESTROYED()` macro at start of methods on `LayoutObject` subclasses (leak detection)

## OWNERS

Code review for `core/layout/` requires approval from layout team owners. The `flex/` directory inherits from `core/layout/OWNERS`. Microsoft contributors (`ethavar@`, `kschmi@`) specialize in Grid.
