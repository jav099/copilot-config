---
name: technical-explainer
description: Create a self-contained, interactive HTML explainer for a technical implementation, algorithm, data flow, architecture, code change, spec, or debugging concept. Use when asked to "make an explainer", "create an interactive explanation", "visualize how this algorithm works", "make a walkthrough page", "explain this implementation with diagrams", or "animate this data flow/index mapping/state machine". Produces one offline HTML file with plain-language prose, annotated diagrams, and source-grounded step-through animations, not a slide deck or marketing page.
---

# Technical Explainer

Create one HTML page that teaches how the real system works. Write for an engineer who knows
the surrounding product, not this subsystem. Assume general engineering knowledge, not specialist
vocabulary. Default to a desktop viewport.

## 1. Ground the explanation

- Read the implementation, relevant diff, tests, and specifications before writing prose.
- Identify the important types, functions, and data flow. Use real examples and cite the source
  file and test name beside them.
- Do not invent source behavior or names. Distinguish implemented, proposed, local, and
  unfinished behavior. Label illustrative inputs and simplified simulations in the visible UI.
- Record the source revision and disclose changes during research. Keep detailed provenance and
  source inventories near the end, with qualifications beside affected claims.

## 2. Teach from overview to detail

Plan these layers without repeating the introduction:

1. **Short version:** two to four sentences on the purpose, central mechanism, and result.
2. **Foundations:** establish the mental model, show the end-to-end pipeline and its handoffs,
   then compare the major variants or subsystems. Use annotated diagrams before implementation
   detail.
3. **Detailed guide:** explain important types, ownership, algorithms, and edge cases in call
   order. Introduce code after the problem it solves. Place interactions beside the mechanism
   they explain, once its vocabulary is established.
4. **Status and sources:** state limits and unresolved questions without turning the opening
   into a revision report.

Use concrete subjects, short sentences, and examples. Define specialist terms at first use.
Explain each component's job before its fields or methods. Separate the normal path from
exceptions, and what happens from why it is necessary.

Preserve depth without an exhaustive helper catalog. For key functions, show trimmed source
excerpts, inputs, outputs, and invariants; distinguish pseudocode from excerpts. Connect them to
the diagrams. Make secondary code expandable. Distinguish index spaces and ownership domains.

## 3. Design for reading

Prefer a quiet, book-like layout: warm light surfaces, readable serif prose and headings, clear
code typography, generous spacing, thin rules, and persistent section navigation. Use one
consistent palette and type scale. Keep the explanation central; avoid dashboard/card grids,
oversized promotional openings, dense control panels, and decorative graphics.

## 4. Build diagrams and walkthroughs

Read `references/anatomy-and-animation.md` before building diagrams or playback controls.

- Draw pipelines, spatial relationships, ownership, mappings, and transitions where prose alone
  is slower to understand. Label the drawing directly.
- Build a step-through walkthrough for algorithms, index mappings, or state machines that
  unfold in steps. Use static diagrams for static structure; cut decorative animation.
- Compute real intermediate states from the example inputs. Highlight the current object or
  index and show calculations before results. Drive pictures, labels, and numbers from the same
  state, not separately scripted illustrations.
- Provide Play/Pause, Previous, Next, Restart, speed, and meaningful case selection. Do not
  autoplay; respect `prefers-reduced-motion`.

## 5. Verify before delivery

- Check HTML/JS syntax and final diff/whitespace.
- Open the page in a desktop browser. Exercise every control and mode, inspect screenshots,
  and check console/page errors.
- Check line positions, endpoints, label collisions, and clipping in representative cases.
  Verify intermediate and final states against source or test expectations, not just identifiers.
- Recheck examples, declaration syntax, excerpts, and qualifications against the source.
- Make one bounded correction pass and disclose remaining limitations. Keep scratch screenshots
  outside the repo and clean them up afterward.

## Output defaults

- Inline CSS/JS/SVG, no build step or remote assets, fonts, scripts, or CDNs.
- Add mobile support only when requested.
- Do not add README, changelog, marketing copy, or product/design-planning artifacts.
