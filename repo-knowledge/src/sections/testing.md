# Testing (Blink Layout / Flex)

## Test Types

### 1. C++ Unit Tests (`blink_unittests`)

Located alongside source files: `flex_layout_algorithm_test.cc`, `layout_flexible_box_test.cc`.

**Base class hierarchy:**
```
RenderingTest (PageTestBase)
  -> BaseLayoutAlgorithmTest
    -> FlexLayoutAlgorithmTest
```

**Key test infrastructure:**
- `RenderingTest` / `PageTestBase`: Sets up a minimal document environment
- `BaseLayoutAlgorithmTest`: Adds `RunBlockLayoutAlgorithm()`, `GetBoxFragmentByElementId()`, `ConstructBlockLayoutTestConstraintSpace()`, `VerifyMainGaps()`, `VerifyCrossGaps()`
- `core_unit_test_helper.h`: Provides `RenderingTest` and common utilities

**Test pattern:**
```cpp
TEST_F(FlexLayoutAlgorithmTest, MyTest) {
  ScopedCSSGapDecorationForTest scoped_feature(true);  // Toggle feature flag

  SetBodyInnerHTML(R"HTML(
    <div id="flexbox" style="display:flex; column-gap:10px; width:200px">
      <div style="width:50px; height:50px"></div>
      <div style="width:50px; height:50px"></div>
    </div>
  )HTML");

  // Option A: Use layout algorithm directly
  BlockNode node(GetLayoutBoxByElementId("flexbox"));
  ConstraintSpace space = ConstructBlockLayoutTestConstraintSpace(
      {WritingMode::kHorizontalTb, TextDirection::kLtr},
      LogicalSize(LayoutUnit(200), LayoutUnit(200)),
      /*stretch_inline_size_if_auto=*/true,
      /*is_new_formatting_context=*/true);
  FragmentGeometry fragment_geometry =
      CalculateInitialFragmentGeometry(space, node, nullptr);
  FlexLayoutAlgorithm algorithm({node, fragment_geometry, space});
  algorithm.Layout();
  const GapGeometry* gap_geometry = algorithm.GetGapGeometry();

  // Option B: Just trigger layout and check results
  UpdateAllLifecyclePhasesForTest();
  auto* fragment = GetBoxFragmentByElementId("flexbox");
  EXPECT_EQ(PhysicalSize(200, 50), fragment->Size());
}
```

**Feature flag toggling:**
```cpp
#include "third_party/blink/renderer/platform/testing/runtime_enabled_features_test_helpers.h"
ScopedCSSGapDecorationForTest scoped_gap_decoration(true);  // Enable
```

### 2. Web Platform Tests (WPT)

Located at `third_party/blink/web_tests/external/wpt/css/`.

- **Flexbox**: `css/css-flexbox/` -- hundreds of tests
- **Gap decorations**: `css/css-gaps/flex/` -- `flex-gap-decorations-*.html`
- **Agnostic gap tests**: `css/css-gaps/agnostic/`

**Test types within WPT:**
- **Reference tests** (`-ref.html`): Visual comparison -- test renders identically to reference
- **testharness.js tests**: JavaScript assertions checking computed values or layout
- **Standalone visual tests**: No ref, just checked for crashes or specific rendering

### 3. Blink-specific Web Tests

Located at `third_party/blink/web_tests/` (non-WPT). Includes:
- `fast/` -- Blink-specific fast tests
- `flag-specific/` -- Tests gated on feature flags
- `virtual/css-gap-decorations-disabled/` -- Virtual test suite for disabled gap decorations

## Running Tests

### Unit tests
```bash
# Build
autoninja -C out/Default blink_unittests

# Run all flex tests
out/Default/blink_unittests --gtest_filter="*FlexLayout*"

# Run specific test
out/Default/blink_unittests --gtest_filter="FlexLayoutAlgorithmTest.GapDecorationsBasic"
```

### Web tests
```bash
# Build
autoninja -C out/Default blink_tests

# Run specific WPT tests
third_party/blink/tools/run_web_tests.py -t Default \
  third_party/blink/web_tests/external/wpt/css/css-gaps/flex/

# Run with specific flags
third_party/blink/tools/run_web_tests.py -t Default \
  --flag-specific=enable-css-gap-decorations \
  third_party/blink/web_tests/external/wpt/css/css-gaps/
```

## Writing New Tests

**For gap decorations:** Add reference tests in `external/wpt/css/css-gaps/flex/`. Name pattern: `flex-gap-decorations-NNN.html` + `flex-gap-decorations-NNN-ref.html`.

**For layout logic:** Add C++ tests in `flex_layout_algorithm_test.cc` using the `FlexLayoutAlgorithmTest` fixture.

**GapGeometry verification helpers:**
```cpp
VerifyMainGaps(expected_gaps, actual_gaps);
VerifyCrossGaps(expected_gaps, actual_gaps);
```
