# Quick Reference

## Key Paths

| Area | Path (relative to `third_party/blink/renderer/`) |
|------|------|
| Flex layout | `core/layout/flex/` |
| Gap geometry | `core/layout/gap/` |
| Layout base classes | `core/layout/layout_algorithm.h`, `core/layout/block_node.h` |
| Constraint space | `core/layout/constraint_space.h` |
| Physical fragments | `core/layout/physical_box_fragment.h` |
| Fragment builder | `core/layout/box_fragment_builder.h` |
| Paint (box fragments) | `core/paint/box_fragment_painter.{h,cc}` |
| Gap decoration painting | `core/paint/gap_decorations_painter.{h,cc}` |
| Computed style | `core/style/computed_style.h` |
| CSS parsing | `core/css/` |
| Test helpers | `core/testing/core_unit_test_helper.h`, `core/layout/base_layout_algorithm_test.h` |
| WPT flex tests | `../../web_tests/external/wpt/css/css-flexbox/` |
| WPT gap tests | `../../web_tests/external/wpt/css/css-gaps/flex/` |
| Runtime feature flags | `platform/runtime_enabled_features.h` |

## Flex Layout Files at a Glance

```
flex/
  flex_layout_algorithm.{h,cc}   -- Main algorithm (Layout(), ComputeMinMaxSizes())
  flex_layout_algorithm_test.cc  -- Unit tests
  flex_item.h                    -- FlexItem struct (per-item sizing data)
  flex_line.h                    -- FlexLine, FlexItemData, FlexLineVector
  flex_line_breaker.h            -- Line breaking (greedy + balanced)
  line_flexer.h                  -- Flex resolution per line
  flex_child_iterator.h          -- Order-aware child iteration
  flex_gap_accumulator.{h,cc}    -- Builds GapGeometry during layout
  layout_flexible_box.{h,cc}     -- LayoutObject subclass for flex containers
  flex_break_token_data.h        -- Fragmentation state carried between fragments
  devtools_flex_info.h           -- DevTools overlay data
```

## Build Commands

```bash
# Build unit tests
autoninja -C out/Default blink_unittests

# Build web tests
autoninja -C out/Default blink_tests

# Build just the core layout target (faster iteration)
autoninja -C out/Default third_party/blink/renderer/core:core
```

## Test Commands

```bash
# Run flex unit tests
out/Default/blink_unittests --gtest_filter="*FlexLayout*"

# Run a specific test
out/Default/blink_unittests --gtest_filter="FlexLayoutAlgorithmTest.GapDecorationsBasic"

# Run WPT gap decoration tests
third_party/blink/tools/run_web_tests.py -t Default \
  third_party/blink/web_tests/external/wpt/css/css-gaps/flex/

# Run WPT flexbox tests
third_party/blink/tools/run_web_tests.py -t Default \
  third_party/blink/web_tests/external/wpt/css/css-flexbox/
```

## Feature Flag Pattern

```cpp
// In source code
if (RuntimeEnabledFeatures::CSSGapDecorationEnabled()) { ... }

// In tests
ScopedCSSGapDecorationForTest scoped_gap_decoration(true);
```

## Common Includes for Flex Work

```cpp
#include "third_party/blink/renderer/core/layout/flex/flex_layout_algorithm.h"
#include "third_party/blink/renderer/core/layout/flex/flex_item.h"
#include "third_party/blink/renderer/core/layout/flex/flex_line.h"
#include "third_party/blink/renderer/core/layout/flex/flex_gap_accumulator.h"
#include "third_party/blink/renderer/core/layout/gap/gap_geometry.h"
#include "third_party/blink/renderer/core/layout/constraint_space.h"
#include "third_party/blink/renderer/core/layout/physical_box_fragment.h"
#include "third_party/blink/renderer/core/style/computed_style.h"
#include "third_party/blink/renderer/platform/geometry/layout_unit.h"
```

## Bug Tracking

- Component: `Blink>Layout>Flexbox` (Buganizer ID: 1456825)
- Team email: `layout-dev@chromium.org`
- OWNERS: See `core/layout/OWNERS` for reviewer list

## Useful Debugging

```cpp
// Dump fragment tree from debugger
fragment->ShowFragmentTree();

// Dump layout input node tree
node.ShowNodeTree();

// Dump fragment tree to string (with flags)
PhysicalFragment::DumpFragmentTree(fragment, flags);
```
