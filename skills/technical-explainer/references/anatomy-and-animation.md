# Diagram and animation reference

Use the page structure in SKILL.md. Read this reference before drawing diagrams or wiring
walkthrough controls.

## Table of contents

- [Diagram conventions](#diagram-conventions)
- [Animation state-machine skeleton](#animation-state-machine-skeleton)

## Diagram conventions

- Prefer inline SVG. Give each diagram an accessible description of what it teaches.
- Define one color per concept with CSS custom properties; reuse it in prose and diagrams.
- Label shapes and connectors directly. Use a legend only when direct labels are insufficient.
- Keep lines and endpoints at their computed positions. Stagger nearby labels or add leader
  lines instead of moving data to avoid collisions. Check the actual rendered size.

## Animation state-machine skeleton

Separate algorithm states, rendering, and playback. Capture actual intermediate states; do not
rerun a completed algorithm on input prefixes when finalization changes those states.

```js
// 1. Precompute every step from real inputs.
function buildScenario(...realInputs) {
  // Return { steps: [...], ...anything the renderer needs }.
  // Each step should carry enough fields to render the diagram, the trace/readout,
  // and the highlighted index, computed with the same logic the real code uses,
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

// 3. Rendering is a pure function of state. Call it from every entry point below,
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
