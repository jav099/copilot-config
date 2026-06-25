# Gap Decorations Testing

## Test Types and Locations

### 1. Web Platform Tests (WPT)

**Location:** `third_party/blink/web_tests/external/wpt/css/css-gaps/`

Organized by container type and concern:

| Directory | Count | Content |
|-----------|-------|---------|
| `parsing/` | ~50 | CSS property parsing (testharness) |
| `grid/` | ~185 | Grid gap decorations (reftests), including direction/writing-mode |
| `grid/fragmentation/` | ~60 | Grid fragmented gap decorations |
| `grid/subgrid/` | ~33 | Subgrid gap decorations |
| `grid/subgrid/fragmentation/` | ~39 | Subgrid fragmented |
| `flex/` | ~135 | Flex gap decorations (reftests), including direction/writing-mode |
| `flex/fragmentation/` | ~45 | Flex fragmented gap decorations |
| `multicol/` | ~88 | Multicol gap decorations, including direction/writing-mode |
| `agnostic/` | ~12 | Container-agnostic + crash tests |
| `animation/` | ~26 | Interpolation/animation |

> Counts include `-ref.html` files; approximate and growing (measured 2026-06-25).

### WPT Test Types

| Type | Suffix | Purpose |
|------|--------|---------|
| **Ref tests** | `-ref.html` | Visual comparison against reference rendering |
| **Crash tests** | `-crash.html` | Verify no crash for given input |
| **Testharness** | `.html` (with testharness.js) | JS assertions for parsing/computed values |

### Writing WPT Reftests

```html
<!DOCTYPE html>
<meta name="assert" content="Gap decorations render correctly for...">
<link rel="match" href="my-test-ref.html">
<style>
  .container {
    display: grid;
    grid-template-columns: 50px 50px;
    gap: 10px;
    row-rule: 2px solid black;
    column-rule: 2px solid black;
  }
</style>
<div class="container">
  <div></div><div></div>
  <div></div><div></div>
</div>
```

Reference file draws the expected result using explicit borders or positioned elements.

### Writing WPT Parsing Tests

```html
<!DOCTYPE html>
<script src="/resources/testharness.js"></script>
<script src="/resources/testharnessreport.js"></script>
<script src="/css/support/parsing-testcommon.js"></script>
<script>
test_valid_value("row-rule-width", "1px");
test_valid_value("row-rule-style", "solid");
test_valid_value("column-rule-color", "red");
test_invalid_value("row-rule-break", "invalid");
</script>
```

### 2. C++ Unit Tests (GTest)

**Gap geometry verification in layout algorithm tests:**

| Test File | Content |
|-----------|---------|
| `layout/grid/grid_layout_algorithm_test.cc` | Grid gap geometry verification |
| `layout/flex/flex_layout_algorithm_test.cc` | Flex gap geometry verification |
| `layout/column_layout_algorithm_test.cc` | Multicol gap geometry verification |
| `paint/box_paint_invalidator_test.cc` | Gap decoration invalidation |
| `style/gap_data_list_test.cc` | GapDataList data structure tests |
| `style/gap_data_test.cc` | GapData data structure tests |

### Test Helpers (`base_layout_algorithm_test.h`)

Two key helpers for verifying gap geometry in unit tests:

```cpp
// Verify main gaps match expected (expected, actual) ordering of Vector<MainGap>
VerifyMainGaps(expected_main_gaps, gap_geometry->GetMainGaps());

// Verify cross gaps (expected, actual) Vector<CrossGap>
VerifyCrossGaps(expected_cross_gaps, gap_geometry->GetCrossGaps());
```

### Common Unit Test Pattern

```cpp
class GapDecorationTest : public BaseLayoutAlgorithmTest {
 protected:
  void SetUp() override {
    BaseLayoutAlgorithmTest::SetUp();
    // Enable the feature flag
    scoped_gap_decoration_.emplace(true);
  }

 private:
  std::optional<ScopedCSSGapDecorationForTest> scoped_gap_decoration_;
};

TEST_F(GapDecorationTest, BasicGridGaps) {
  SetBodyInnerHTML(R"HTML(
    <div id="container" style="display:grid; grid-template-columns:50px 50px;
         gap:10px; row-rule:2px solid black; column-rule:2px solid black;">
      <div></div><div></div>
      <div></div><div></div>
    </div>
  )HTML");

  const auto* fragment = GetBoxFragmentByElementId("container");
  ASSERT_TRUE(fragment);
  const auto* gap_geometry = fragment->GetGapGeometry();
  ASSERT_TRUE(gap_geometry);

  VerifyMainGaps(/* expected */ expected_main_gaps, gap_geometry->GetMainGaps());
  VerifyCrossGaps(/* expected */ expected_cross_gaps, gap_geometry->GetCrossGaps());
}
```

### Feature Flag Scoping

**Critical:** All gap decoration tests must enable the feature flag:

```cpp
// In test fixture (preferred for class-wide)
ScopedCSSGapDecorationForTest scoped_gap_decoration(true);

// Or inline in individual tests
ScopedCSSGapDecorationForTest scoped_gap_decoration(true);
```

Without this, gap decoration properties parse as unknown and GapGeometry is never built.

## Running Tests

### WPT Tests

```bash
# Run all gap decoration WPT tests
vpython3 third_party/blink/tools/run_web_tests.py -t out/debug_full_x64 \
  external/wpt/css/css-gaps/ --no-retry

# Run specific subdirectory
vpython3 third_party/blink/tools/run_web_tests.py -t out/debug_full_x64 \
  external/wpt/css/css-gaps/grid/ --no-retry

# Run single test
vpython3 third_party/blink/tools/run_web_tests.py -t out/debug_full_x64 \
  external/wpt/css/css-gaps/grid/grid-gap-decorations-001.html --no-retry
```

### C++ Unit Tests

```bash
# Build and run layout tests (grid, flex, multicol gap geometry)
autoninja -C out/debug_full_x64 blink_unittests
./out/debug_full_x64/blink_unittests --gtest_filter="*GapDecoration*"

# Grid-specific
./out/debug_full_x64/blink_unittests --gtest_filter="GridLayoutAlgorithmTest.*Gap*"

# Flex-specific
./out/debug_full_x64/blink_unittests --gtest_filter="FlexLayoutAlgorithmTest.*Gap*"

# Paint invalidation
./out/debug_full_x64/blink_unittests --gtest_filter="BoxPaintInvalidatorTest.*Gap*"

# Style data structure tests
./out/debug_full_x64/blink_unittests --gtest_filter="GapData*"
```

### Web Test Output

Results go to a timestamped directory: `out/debug_full_x64/layout-test-results_YYYY-MM-DD-HH-MM-SS/`

Key artifacts:
- `{test-name}-actual.png` -- what was actually rendered
- `{test-name}-expected.png` -- baseline reference
- `{test-name}-diff.png` -- visual diff highlighting pixel differences
- `{test-name}-stderr.txt` -- STDERR from content_shell
- `results.html` -- interactive viewer (open in browser)

```bash
# Find most recent results
ls -dt out/debug_full_x64/layout-test-results_* | head -1
```

## Known Failing Tests

| Test | Bug |
|------|-----|
| `multicol-gap-decorations-007.html` | crbug.com/445971864 |

(As of 2026-06-25, this is the only css-gaps entry remaining in `TestExpectations`. The previously-listed `flex-gap-decorations-fragmentation-005/006` (crbug.com/357648037) and `grid-gap-decorations-fragmentation-028` (crbug.com/394042462) are no longer marked failing.)

## Testing Conventions

- Reftests preferred for visual gap decoration verification (pixel-accurate)
- Crash tests (`*-crash.html`) for edge cases that previously caused crashes
- Feature flag MUST be enabled in C++ tests (`ScopedCSSGapDecorationForTest`)
- Use `VerifyMainGaps()` / `VerifyCrossGaps()` helpers for geometry verification
- Always call `UpdateAllLifecyclePhasesForTest()` after DOM changes
- Test fragmented gap decorations using multi-column containers:
  ```html
  <div style="columns:3; column-fill:auto; height:100px;">
    <!-- Content with gap decorations that fragments -->
  </div>
  ```
