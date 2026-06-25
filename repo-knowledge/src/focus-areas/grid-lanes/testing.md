# Grid-Lanes Testing

## Test Types and Locations

### 1. Web Platform Tests (WPT) — canonical

**Location:** `third_party/blink/web_tests/external/wpt/css/css-grid/grid-lanes/`

~736 non-reference HTML tests + ~527 `-ref.html` references + 8 `-crash.html`. Organized by concern:

| Directory | ~Tests (incl. refs) | Content |
|-----------|---------------------|---------|
| `./` (root) | 19 | Top-level masonry layout |
| `abspos/` | 25 | Out-of-flow / absolutely positioned items |
| `alignment/` | 133 | `align/justify-content`, `align/justify-self`, `*-items` |
| `animation/` | 7 | Interpolation/animation (e.g. `flow-tolerance`) |
| `baseline/` | 80 | Baseline alignment (grid axis) |
| `fragmentation/` | 6 | Fragmented grid-lanes (currently skipped — see Known Failing) |
| `gap/` | 12 | Row/column gap in both axes |
| `grid-placement/` | 28 | Line resolution / explicit placement |
| `intrinsic-sizing/` | 121 (+`support/`) | min/max-content sizing of container + items |
| `invalidation/` | 12 | Style-change invalidation |
| `item-placement/` | 44 | Auto-placement core |
| `item-placement/dense-packing/` | 64 | `grid-lanes-pack: dense` (incl. multi-span openings) |
| `item-placement/flow-tolerance/` | 26 | `flow-tolerance` tie band |
| `items/` | 45 (+`support/`) | Item layout/sizing |
| `order/` | 22 | `order` property reordering |
| `overflow/` | 10 | Overflow / scrolling |
| `subgrid/grid-subgridded-to-grid-lanes/` | 5 + `column/`20 + `gap/`76 + `row/`18 + `track-sizing/`74 | Grid subgrid inside grid-lanes |
| `subgrid/grid-lanes-subgridded-to-grid-lanes/track-sizing/` | 6 | Grid-lanes subgrid inside grid-lanes |
| `tentative/` | 1 + `intrinsic-sizing/`18 + `item-placement/`76 + `parsing/`14 (+`grid-subgridded-to-grid-lanes/`2) | Spec-unstable behavior + **parsing** testharness tests |
| `track-sizing/` | 43 | Grid-axis track sizing |
| `track-sizing/auto-repeat/` | 84 (+`intrinsic-auto-repeat/`173) | `repeat()` incl. `masonry-intrinsic-repeat` |

> The bulk of behavioral tests are **reftests** (`-ref.html`). `tentative/parsing/` holds
> **testharness** parsing/computed-value tests (e.g. `flow-tolerance-computed.html`,
> `flow-tolerance-invalid.html`). `*-crash.html` (8) guard against regressions in edge cases.

### 2. Internal WPT

**Location:** `third_party/blink/web_tests/wpt_internal/css/css-grid-lanes/`

Currently a single reftest pair: `column-dense-packing-multi-span-005.html` (+ `-ref.html`). Use for
Blink-specific cases not (yet) upstreamable.

### 3. Blink web tests (non-WPT)

**Location:** `third_party/blink/web_tests/fast/css-grid-lanes/`

`grid-lanes-element-auto-repeat-get-set.html` (+ `-expected.txt`) — a JS/dump-render-tree-style test
for auto-repeat get/set behavior.

### 4. Virtual suite — flag DISABLED

**Location:** `third_party/blink/web_tests/virtual/disable-css-grid-lanes-layout/`

Configured in `VirtualTestSuites` (prefix `disable-css-grid-lanes-layout`, platform **Win** only,
owner `almaher@microsoft.com`):

```json
{ "prefix": "disable-css-grid-lanes-layout",
  "platforms": ["Win"],
  "bases": ["external/wpt/css/css-grid/parsing"],
  "args": ["--disable-blink-features=CSSGridLanesLayout"] }
```

It re-runs the `css-grid/parsing` tests with the flag **off**, verifying that the new intrinsic
auto-repeat / `repeat()` parsing degrades correctly when grid-lanes is disabled (the checked-in
`*-expected.txt` baselines under `.../external/wpt/css/css-grid/parsing/` capture the off-state
serialization, e.g. `grid-template-columns-intrinsic-auto-repeat-computed.tentative-expected.txt`).

### 5. C++ Unit Tests (GTest)

**Location:** `third_party/blink/renderer/core/layout/grid_lanes/grid_lanes_layout_algorithm_test.cc`
(in the `blink_unittests` target via `build.gni:763`). ~50 `TEST_F(GridLanesLayoutAlgorithmTest, …)`.

Coverage highlights: `ConstructGridLanesItems`, `GridLanesAutoPlacedItems`, `BuildRanges`,
`BuildFixedTrackSizes`, `CollectGridLanesItemGroups[WithBaseline]`,
`Explicitly/AutoPlacedVirtualItems`, `BuildIntrinsicTrackSizes`, `MaximizeAndStretchAutoTracks`,
`ExpandFlexibleTracks`, `{Column,Row}AutoFit*/AutoFill*` placement matrices, `GetFirstEligibleLine`,
`GetMaxPositionsForAllTracks`, `{Orthogonal,}AppendSubgriddedItems{Columns,Rows}`,
`AutoPlacedSubgriddedItemsAreAutoPlaced`, `Subgrid{Rows,Columns}IgnoredIn{Column,Row}GridLanes`.

### Test Fixture & Flag Scoping

```cpp
class GridLanesLayoutAlgorithmTest : public BaseLayoutAlgorithmTest {
 protected:
  void SetUp() override { BaseLayoutAlgorithmTest::SetUp(); }
  void ComputeGeometry(GridLanesLayoutAlgorithm& algorithm);   // runs sizing + caches virtual items
  // accessors: VirtualItemCount(), Ranges(), TrackSizes(),
  //            MaxContentContribution(i), MinContentContribution(i), VirtualItemSpan(i),
  //            GetMaxPositionsForAllTracks(rp, span), InitializeGridLanesRunningPositions(...),
  //            SetAutoPlacementCursor(c, rp), TrackCollection()
  GridTrackSizingDirection grid_axis_direction_;
  Persistent<const GridLayoutData> layout_data_;
  Vector<GridLanesItemCachedData> virtual_items_data_;
};
```

**Critical difference from gap-decorations:** there is **NO `ScopedCSSGridLanesLayoutForTest`**.
`CSSGridLanesLayout` is `status: experimental`, and `blink_unittests` enables all experimental
features by default (`ScopedUnittestsEnvironmentSetup` →
`WebRuntimeFeatures::EnableExperimentalFeatures(true)` →
`RuntimeEnabledFeatures::SetExperimentalFeaturesEnabled(true)`, in
`platform/testing/testing_platform_support.cc`). So `display: grid-lanes` simply parses in unit
tests; no per-test flag scoping is needed. (If a test ever needs the **disabled** state in C++, it
must add its own `ScopedCSSGridLanesLayoutForTest scoped(false)` — that scoper is auto-generated from
the flag name, but is **not currently used** anywhere.)

The fixture is friended into the production classes
(`friend class GridLanesLayoutAlgorithmTest;` in `grid_lanes_layout_algorithm.h`,
`grid_lanes_running_positions.h`, `grid_lanes_item_group.h`, and `grid/grid_track_collection.h`) so
tests can call private methods (`ComputeSizingTreeInGridAxis`, `CalculateIntrinsicTrackSizes`) and
construct `GridLanesRunningPositions` via the testing-only constructor
(`{running_positions}, tie_threshold, {collapsed_tracks}`).

### Common Unit Test Patterns

**A. DOM-driven layout test** (most behavioral tests):

```cpp
TEST_F(GridLanesLayoutAlgorithmTest, ConstructGridLanesItems) {
  SetBodyInnerHTML(R"HTML(
    <div id="grid-lanes" style="display:grid-lanes;
         grid-template-columns:auto auto [header-start] auto auto [header-end];">
      <div>1</div>
      <div style="grid-column: 3 / span 2">2</div>
      ...
    </div>
  )HTML");

  GridLanesNode node(GetLayoutBoxByElementId("grid-lanes"));
  const GridLineResolver line_resolver(node.Style(), /*auto_repetitions=*/0);
  auto* grid_lanes_items =
      node.ConstructGridItems(line_resolver, /*must_invalidate_placement_cache=*/nullptr);
  // EXPECT_EQ resolved spans...
}
```

**B. Direct running-positions test** (no DOM — exercises the placement math):

```cpp
TEST_F(GridLanesLayoutAlgorithmTest, GetFirstEligibleLine) {
  auto running_positions = InitializeGridLanesRunningPositions(
      {LayoutUnit(2.0), LayoutUnit(3.0), LayoutUnit(3.5), LayoutUnit(2.5)},
      /*tie_threshold=*/LayoutUnit(0.5));
  SetAutoPlacementCursor(1, running_positions);
  LayoutUnit max_position;
  EXPECT_EQ(running_positions.GetFirstEligibleLine(/*span_size=*/2, max_position),
            GridSpan::TranslatedDefiniteGridSpan(1, 3));
  EXPECT_EQ(max_position, LayoutUnit(3.5));
}
```

## Running Tests

### WPT / Web Tests

```bash
# All canonical grid-lanes WPT tests
vpython3 third_party/blink/tools/run_web_tests.py -t out/debug_full_x64 \
  external/wpt/css/css-grid/grid-lanes/ --no-retry

# A subdirectory (e.g. dense packing)
vpython3 third_party/blink/tools/run_web_tests.py -t out/debug_full_x64 \
  external/wpt/css/css-grid/grid-lanes/item-placement/dense-packing/ --no-retry

# Single test
vpython3 third_party/blink/tools/run_web_tests.py -t out/debug_full_x64 \
  external/wpt/css/css-grid/grid-lanes/item-placement/dense-packing/column-dense-packing-001.html --no-retry

# Internal + Blink web tests
vpython3 third_party/blink/tools/run_web_tests.py -t out/debug_full_x64 \
  wpt_internal/css/css-grid-lanes/ fast/css-grid-lanes/ --no-retry

# Flag-disabled virtual suite (parsing degradation)
vpython3 third_party/blink/tools/run_web_tests.py -t out/debug_full_x64 \
  virtual/disable-css-grid-lanes-layout/ --no-retry
```

### C++ Unit Tests

```bash
autoninja -C out/debug_full_x64 blink_unittests

# All grid-lanes unit tests
./out/debug_full_x64/blink_unittests --gtest_filter="GridLanesLayoutAlgorithmTest.*"

# A specific test
./out/debug_full_x64/blink_unittests --gtest_filter="GridLanesLayoutAlgorithmTest.GetFirstEligibleLine"

# Placement/dense-packing math
./out/debug_full_x64/blink_unittests --gtest_filter="GridLanesLayoutAlgorithmTest.*EligibleLine*:GridLanesLayoutAlgorithmTest.*MaxPositions*"
```

### Web Test Output

Results go to a timestamped dir: `out/debug_full_x64/layout-test-results_YYYY-MM-DD-HH-MM-SS/`.
Key artifacts per failing reftest: `{test}-actual.png`, `{test}-expected.png`, `{test}-diff.png`,
`{test}-stderr.txt`, and `results.html` (interactive viewer).

```bash
ls -dt out/debug_full_x64/layout-test-results_* | head -1
```

## Known Failing Tests

All grid-lanes failures are currently tracked under the **umbrella bug crbug.com/1076027** in
`TestExpectations` (21 entries — the feature is in active development):

| Area | Entries | Notes |
|------|---------|-------|
| `grid-lanes/fragmentation/*` | 1 (whole dir) | `[ Failure Skip ]` — fragmentation not yet implemented |
| `grid-lanes/subgrid/grid-subgridded-to-grid-lanes/track-sizing/*` | 5 | auto-track-sizing + column-subgrid-with-row-standalone-axis-size 006–009 |
| `grid-lanes/subgrid/grid-lanes-subgridded-to-grid-lanes/track-sizing/*` | 3 | grid-lanes-subgrid[-flex/-intrinsic-sizing] |
| `grid-lanes/alignment/{column-align-self,column-align-items,row-justify-self,row-justify-items}-00{1,2,3}` | 12 | self/items alignment in the stacking-vs-grid axis |

These reflect incomplete areas (fragmentation, certain subgrid track-sizing, and some
stacking-axis alignment), not flaky tests.

## Testing Conventions

- Prefer **reftests** for visual placement/sizing (the masonry algorithm is geometry-heavy).
- Put spec-unstable behavior and parsing tests under `tentative/` (parsing uses testharness;
  `parsing-testcommon.js`).
- C++ tests need **no flag scoping** — experimental features are on in `blink_unittests`. Verify the
  off-state via the `disable-css-grid-lanes-layout` virtual suite instead.
- Use `InitializeGridLanesRunningPositions(...)` + `SetAutoPlacementCursor(...)` to unit-test
  placement math directly, without a DOM.
- Always call `UpdateAllLifecyclePhasesForTest()` after DOM mutations in lifecycle-style tests.
- Use `GetLayoutBoxByElementId("…")` to wrap a `GridLanesNode` / `BlockNode` for node-level tests.
