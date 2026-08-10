# Explainer anatomy and animation state-machine pattern

Reference used to build the reusable structure of a technical explainer. Read this before
laying out sections or wiring up Play/Pause/Step controls.

## Table of contents

- [Recommended section order](#recommended-section-order)
- [Diagram conventions](#diagram-conventions)
- [Animation state-machine skeleton](#animation-state-machine-skeleton)

## Recommended section order

Not every section applies to every explainer — skip what the source material doesn't need, but
keep the order when multiple apply:

1. **Header/scope card** — one or two sentences on what the page is (and isn't): which branch/CL,
   which files, "not a spec proposal", viewport expectations.
2. **On this page (TOC)** — anchor links to every `<section>`, so a reader can jump straight to
   the part they need.
3. **Mental model** — a short, concrete analogy (e.g. "numbered stickers on shelved boxes") paired
   with one annotated SVG diagram. This section carries the reader before any code appears; it
   should make the core constraint obvious without naming a single function.
4. **Architecture / pipeline** — how data moves from input (e.g. a CSS value list, an API call)
   to the observable output (e.g. a painted pixel, a response). One diagram, annotated in place.
5. **Index-space / ownership mapping** (if the concept has more than one index space, e.g.
   "geometric index" vs. "placement index", or "local" vs. "global") — a diagram that shows the
   mapping explicitly, since this is where readers get lost fastest.
6. **The tricky rules/cases** — the branches, reversals, or edge cases that make this concept
   non-trivial. Show each case with its own small diagram or example.
7. **Function-by-function walkthrough** — real trimmed excerpts in call order, each with a one-
   paragraph explanation of inputs/outputs/invariants and a pointer back to the diagram/animation.
8. **Interactive animation** — see below. Place after the walkthrough so the reader already knows
   the vocabulary the animation uses.
9. **Current status / open questions** — honest, undramatic list of what's still unverified or
   under review. Don't turn this into a review report; state each item as a fact plus its
   uncertainty.
10. **Footer: sources read** — list the exact source/test/doc files the page was built from.

## Diagram conventions

- Prefer inline `<svg>` over external images — keeps the file self-contained and lets you
  annotate with `<text>` directly on the shapes.
- Give every diagram an `aria-label` (or `role="img"` + `aria-label`) that describes what it shows
  in one sentence, for accessibility and as a sanity check that the diagram has a clear point.
- Use one consistent color per concept across the whole page (e.g. one color for "the main axis",
  a different one for "the cross axis", a third for "the value/pattern being assigned") — define
  them once as CSS custom properties and reuse them in both prose pills and SVGs.
- Label the diagram directly; only add a legend if more than ~4 colors are in play.

## Animation state-machine skeleton

Use this shape for a step-through animation. It separates "what step are we on" (state) from
"how do we render a step" (render functions) from "how do we move between steps" (controls),
which keeps Play/Pause/Prev/Next/Restart/speed all consistent.

```js
// 1. Precompute every step from real inputs — never hand-author step data.
function buildScenario(...realInputs) {
  // Return { steps: [...], ...anything the renderer needs }.
  // Each step should carry enough fields to render the diagram, the trace/readout,
  // and the highlighted index — computed with the same logic the real code uses,
  // not approximated.
}

// 2. One state object is the single source of truth for "where are we".
var state = {
  modeId: "default",   // which case/mode is selected, if the page supports switching
  scenario: null,       // the current buildScenario() result
  stepIndex: 0,
  playing: false,
  timer: null,
};

// 3. Rendering is a pure function of state — call it from every entry point below,
//    never mutate the DOM directly from an event handler.
function renderStep(step) { /* update diagram highlight, trace readout, connector, etc. */ }

function goToStep(index) {
  var steps = state.scenario.steps;
  state.stepIndex = Math.max(0, Math.min(steps.length - 1, index));
  renderStep(steps[state.stepIndex]);
  if (state.stepIndex === steps.length - 1) stopPlaying();
}

function setMode(modeId) {
  stopPlaying();
  state.modeId = modeId;
  state.scenario = buildScenario(/* inputs for this mode */);
  state.stepIndex = 0;
  goToStep(0);
}

function stopPlaying() {
  state.playing = false;
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  // reset the Play button's label/aria-label back to "Play"
}

function startPlaying() {
  if (state.stepIndex >= state.scenario.steps.length - 1) state.stepIndex = -1;
  state.playing = true;
  // set the Play button's label/aria-label to "Pause"
  var speedMs = Number(speedInput.value);
  state.timer = setInterval(function () {
    if (state.stepIndex >= state.scenario.steps.length - 1) { stopPlaying(); return; }
    goToStep(state.stepIndex + 1);
  }, speedMs);
}

// 4. Respect prefers-reduced-motion: never autoplay, and either skip transition
//    animations or shorten them to ~0 when this matches.
var prefersReducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

Wire Play/Pause to one button that toggles `startPlaying()`/`stopPlaying()`; wire Previous/Next to
`goToStep(state.stepIndex - 1 / + 1)` after calling `stopPlaying()`; wire Restart to
`goToStep(0)`; wire a speed `<input type="range">` to update the running interval in place if
already playing. Wire mode tabs (`role="tablist"`/`role="tab"`) to `setMode(id)` and update
`aria-selected`/`tabindex` on each tab so keyboard users can switch modes.
