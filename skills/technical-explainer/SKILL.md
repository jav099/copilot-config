---
name: technical-explainer
description: Create a self-contained, interactive HTML explainer for a technical implementation, algorithm, data flow, architecture, code change, spec, or debugging concept. Use when asked to "make an explainer", "create an interactive explanation", "visualize how this algorithm works", "make a walkthrough page", "explain this implementation with diagrams", or "animate this data flow/index mapping/state machine". Produces a single offline HTML file with plain-language prose, annotated diagrams, and a step-through animation grounded in the real source, tests, and specs — not a slide deck or marketing page.
---

# Technical Explainer

Build a single self-contained HTML page (no build step, no remote assets) that teaches how a
specific piece of code, algorithm, or design actually works. Default to HTML output and a desktop
viewport unless the user asks for something else.

## Workflow

If spawning a subagent to write the explainer, set its model explicitly to
GPT-5.6 Sol (`gpt-5.6-sol`). Do not rely on the default model.

### 1. Ground in the real source

Before writing any prose:

- Read the actual implementation, diff, tests, and specs/design docs for the thing being explained.
- Enumerate the exact functions/types/data flow the explainer must cover — don't paraphrase from
  memory.
- Pull real examples from tests or real data wherever they exist, and name the exact source file
  (and test name, if applicable) next to each example.
- Never invent values, topology, states, behavior, or function names. If something is unclear or
  unimplemented, say so explicitly rather than filling the gap.

### 2. Plan the structure

Sketch sections before writing HTML. A typical order: mental model → architecture/pipeline →
index-space or ownership mapping (if relevant) → the tricky rules/cases → function-by-function
walkthrough → interactive animation → current status/open questions. See
`references/anatomy-and-animation.md` for the full anatomy pattern and a copy-ready animation
state-machine skeleton — read it before building the diagrams or the Play/Pause/Step controls.

### 3. Write in the simplest language that stays accurate

- Explain in the clearest, simplest terms possible; define any technical term before using it.
- Use short sentences and concrete examples over abstract description.
- Separate "what happens" (the mechanism) from "why it exists" (the constraint or bug it solves).
- Layer detail: a beginner should follow the overview sections; an engineer should be able to
  inspect the function walkthroughs and verify them against source.

### 4. Add diagrams where they carry the idea

Use a diagram (inline SVG is fine) whenever prose alone would be slower to parse:

- architecture/pipelines, before/after or spatial layouts, index-space mappings, state
  transitions, ownership/data-flow relationships.
- Annotate diagrams directly (labels on the shapes) instead of relying on a distant legend.

### 5. Add animation/interaction only when the concept is sequential or dynamic

Build a step-through animation when the explainer covers an algorithm, index mapping, or state
machine that unfolds over time or over a sequence of inputs. Skip it for static structure.

- Step through real algorithm states computed from real inputs — don't hand-author fake numbers.
- Highlight the current input/object/index and show intermediate calculations before the result.
- Provide Play/Pause, Previous, Next, Restart, and a speed control; support switching between
  meaningful modes/cases (e.g. the different reversal/edge-case combinations that actually occur).
- Respect `prefers-reduced-motion` (skip/shorten transitions, don't autoplay).
- Every animation must teach a specific mechanic — if it's decorative, cut it.
- See `references/anatomy-and-animation.md` for the state-machine pattern (`state` object,
  `goToStep`/`setMode`/`startPlaying`/`stopPlaying`) used successfully in the reference explainer.

### 6. Write the function-by-function walkthrough

Cover every significant function/type added or materially changed for the thing being explained.
For each: show a concise, trimmed excerpt (not the whole file); state its inputs, outputs,
invariants, and where it sits in call order; connect it back to the diagram or animation step it
corresponds to. Distinguish index spaces and ownership domains explicitly wherever more than one
is in play (e.g. "geometric order" vs. "placement order", or "local index" vs. "global index").

### 7. Be honest about status

Distinguish current behavior, intended/proposed behavior, open questions, and known limitations —
never present a proposed design as already implemented. If the explainer covers a mix of exact
real test cases and a synthetic/illustrative mode, label which is which in the UI itself (not just
in comments).

### 8. Invoke `impeccable` before authoring the UI

Before writing HTML/CSS, invoke the `impeccable` skill and follow its context and craft-floor
workflow. Choose Read mode for a mostly-prose walkthrough or Operate mode if the explainer is
primarily an interactive tool; either way keep the explanation itself as the visual focal point —
avoid generic dashboard/card-grid styling, and use one coherent visual system (palette, spacing,
type scale) throughout the page.

### 9. Validate before delivering

- Validate the HTML/JS syntax.
- Open the page at a desktop viewport with Playwright or the available browser-runner skill.
- Exercise every control and every mode/case in the animation.
- Inspect screenshots and check the console/page for errors.
- Re-verify every example, function name, and code excerpt against the source again.
- Run one bounded correction pass for anything that fails; don't loop indefinitely.
- Keep scratch screenshots outside the repo and clean them up afterward.
- Run a diff/whitespace check on the final file before considering it done.

## Output defaults

- Self-contained single HTML file, inline CSS/JS/SVG, no remote fonts/scripts/CDNs.
- Desktop-quality layout (e.g. a fixed/min-width page); only add responsive/mobile support if the
  user explicitly asks for it.
- No README/changelog/marketing copy — the explainer's job is to teach the reader how the real
  thing works, using the real thing's own names and values.
