---
name: editorial-profile-grid
description: >-
  Design or refine clean, light, editorial personal sites, portfolios, profile
  pages, project showcases, and professional homepages built around a narrow
  profile/context column and a wider work grid. Use when the user asks for an
  "editorial portfolio", "profile and work grid", "serif portfolio",
  "print-inspired personal site", "quiet professional homepage", "clean
  project showcase", or a restrained static site with thin rules and generous
  whitespace. This is a content-led, square-cornered visual direction—not a
  generic minimalist or AI-generated portfolio, SaaS dashboard, bento grid,
  glassmorphic page, or collection of rounded cards.
---

# Editorial Profile Grid

Create a restrained, content-first page that feels closer to an edited profile
or small print catalogue than a product dashboard. Pair a compact identity or
context area with a more expansive body of selected work. Let typography,
spacing, and fine rules establish hierarchy.

Apply the principles rather than reproducing one fixed template. Adapt the
section order, grid spans, type scale, accent, and density to the supplied
content and the project's existing brand.

## Content and privacy boundary

- Use only facts, text, images, and URLs the user or repository provides.
- Never copy a source site's identity, biography, employers, education,
  locations, contact details, project names, claims, dates, or links.
- Never invent personal details or achievements to make a layout look complete.
- Use explicit placeholders such as `[Name]`, `[Role or short descriptor]`,
  `[Two-sentence biography]`, `[Project title]`, and `[Verified URL]` when
  information is missing. Tell the user what still needs replacement.
- Concise copy is part of the design. Edit for clarity only when authorized;
  otherwise preserve the user's wording.

## Default implementation stance

- Prefer straightforward HTML and a focused stylesheet.
- Follow the project's existing framework, rendering model, and hosting setup.
- Do not add a framework, package, build step, web font request, analytics, or
  client-side JavaScript unless the task actually requires it.
- In an existing project, preserve its stack, naming conventions, tokens, and
  useful components. Make the smallest coherent change.
- Start at the smallest viewport, then enhance the composition with
  `min-width` media queries.

## Workflow

### 1. Audit before designing

Read the repository guidance and the files that control the current page:

- `AGENTS.md`, README files, content sources, and deployment configuration;
- existing HTML landmarks and heading order;
- CSS custom properties, type rules, breakpoints, spacing, and component
  patterns;
- image assets and their dimensions;
- the exact content and links approved for publication.

Do not overwrite an established design system just to force this visual
direction. Reuse compatible conventions and introduce only the tokens or
classes needed.

### 2. Identify the content hierarchy

Write a short hierarchy before writing markup:

1. identity or page context;
2. role and concise introduction;
3. a small set of useful facts or navigation links;
4. selected projects, writing, experience, services, or other primary content;
5. contact and a quiet footer.

Omit sections that have no real content. Do not manufacture six projects, a
portrait, metrics, testimonials, status indicators, or social links merely to
fill a composition.

### 3. Choose the smallest static structure

Start with one reading column. At wide viewports, split it into a narrow
profile/context column and a wider work/content region. Use:

- `<header>` for the masthead or profile introduction;
- `<nav>` for real navigation;
- one `<main>` landmark;
- `<section>` with a heading for each major content group;
- `<ol>` when selected work has an intentional sequence, otherwise `<ul>`;
- `<article>` for independently understandable work entries;
- `<dl>` for compact label/value facts;
- `<address>` only for actual contact information.

Keep the DOM shallow. The visual grid should not require wrapper-heavy markup.

### 4. Establish the visual system

Use a warm off-white page, a subtly lighter content surface, near-black ink,
quiet gray text, fine neutral rules, and muted teal as the primary accent.
Use sand, muted purple, and pastel lavender sparingly as a secondary palette:

- `#e8e1d4`: warm sand backgrounds for subsection transition slides.
- `#705a85`: selected headings and small icons, with enough contrast for text.
- `#e8e1ef`: optional pale lavender surface accents, not the default transition
  background.
- `#d2c4df`: soft lavender fills in diagrams, not body text.

Keep most surfaces neutral. Teal remains the primary accent; purple adds a
small amount of variety rather than replacing it. In presentations, main
transitions stay teal while subsection transitions use sand. Keep purple for
selected headings, icons, and diagram accents. Preserve
logo colors and existing brand commitments. Check contrast on the actual
background, and never use color alone to explain a diagram.

Optional category colors may tint small labels or rules only; they must not
turn the page into a rainbow card grid.

Use a bookish serif stack for display headings and a readable system sans-serif
stack for body text and metadata. Favor:

- large, compact serif headings with restrained negative tracking;
- comfortable sans-serif body copy with a measure around `55ch` to `70ch`;
- small uppercase labels with careful letter spacing;
- tabular numerals for entry indices;
- generous section whitespace and modest internal padding;
- square corners, flat surfaces, and thin borders instead of shadowed cards.

Avoid:

- glassmorphism, blur, gradients, glows, neon, and decorative noise;
- rounded dashboard cards, glowing pills, green status dots, metric tiles, and
  generic bento/SaaS layouts;
- oversized empty hero sections, animated blobs, fake terminal windows, and
  typewriter effects;
- decorative motion or JavaScript-driven layout;
- repeated cards that erase hierarchy by giving every item equal visual weight.

### 5. Build mobile first, then enhance

On small screens:

- keep one column and natural document order;
- put identity/context before work unless the content requires another order;
- use compact navigation that wraps safely;
- allow long names, URLs, and code-like text to wrap without horizontal scroll;
- use rules and whitespace to separate entries.

At medium widths, allow a two-column work grid and let selected entries span the
full grid only when their content merits emphasis. At large widths, introduce
the narrow/wide page split. A sticky profile is optional and should be used only
when its content fits comfortably in the viewport.

### 6. Validate and simplify

Review the real page, not just the source:

- check approximately `320px`, `375px`, `768px`, and a wide desktop viewport;
- confirm content reflows without clipping, overlap, or horizontal scrolling;
- check that headings, labels, links, and section boundaries remain clear;
- check that text and rules remain easy to read against their backgrounds;
- confirm the page works with JavaScript disabled;
- check the CSS gap-decoration fallback in a browser without support;
- remove unused wrappers, effects, dependencies, and repeated copy.

Stop when the hierarchy is clear and the page feels composed. Do not add
decoration to fill every quiet area.

## HTML structure pattern

Treat this as a shape to adapt, not copy-ready content. Replace every bracketed
value with verified information or leave it visibly marked as a placeholder.

```html
<header class="masthead">
  <div class="shell masthead__inner">
    <a class="site-mark" href="/">
      [Short site mark]
    </a>
    <nav>
      <ul class="nav-list">
        <li><a href="#profile">Profile</a></li>
        <li><a href="#work">Work</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </nav>
  </div>
</header>

<main class="shell page-layout" id="main-content">
  <header class="profile" id="profile">
    <p class="eyebrow">[Role or short descriptor]</p>
    <h1>[Name or page title]</h1>
    <p class="lede">[Two-sentence introduction using verified copy.]</p>

    <dl class="fact-list">
      <div>
        <dt>[Fact label]</dt>
        <dd>[Verified fact]</dd>
      </div>
    </dl>

    <section id="contact">
      <h2 class="minor-heading" id="contact-title">Contact and profiles</h2>
      <ul class="link-list">
        <li><a href="[Verified URL]">[Link purpose]</a></li>
      </ul>
    </section>
  </header>

  <section class="work" id="work">
    <header class="section-header">
      <div>
        <p class="section-label">[Section label]</p>
        <h2 id="work-title">[Section title]</h2>
      </div>
      <p>[Short section introduction.]</p>
    </header>

    <ol class="work-grid">
      <li class="work-grid__wide">
        <article class="work-entry">
          <header class="entry-header">
            <span class="entry-type">[Category]</span>
            <span>01</span>
          </header>
          <h3><a href="[Verified URL]">[Project title]</a></h3>
          <p>[Concise description focused on the work and outcome.]</p>
          <footer>[Scope, medium, or date]</footer>
        </article>
      </li>
    </ol>
  </section>
</main>
```

If an external URL intentionally opens a new tab, use
`target="_blank" rel="noopener noreferrer"`. Do not open new tabs by default.
An arrow glyph can reinforce that the destination is external.

## CSS direction

The following is a starting vocabulary, not a mandatory palette or complete
stylesheet. Reconcile it with existing tokens and adjust the accent, spacing,
and proportions to suit the content. Keep text and rules clearly readable after
every color change.

```css
:root {
  color-scheme: light;
  --page: #f4f4f0;
  --surface: #fbfbf8;
  --ink: #202522;
  --muted: #555d58;
  --rule: #c9cec8;
  --rule-strong: #a7afa9;
  --accent: #285b62;
  --accent-strong: #17454b;
  --secondary-accent: #705a85;
  --secondary-tint: #e8e1d4;
  --lavender-tint: #e8e1ef;
  --diagram-soft: #d2c4df;
  --selection: #d6e4e2;
  --serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua",
    Palatino, Georgia, serif;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial,
    sans-serif;
  --page-width: 88rem;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  border-block-start: 0.25rem solid var(--accent);
  background: var(--page);
  color: var(--ink);
  font-family: var(--sans);
  line-height: 1.6;
}

::selection {
  background: var(--selection);
  color: var(--ink);
}

.shell {
  width: min(calc(100% - 2rem), var(--page-width));
  margin-inline: auto;
}

a {
  color: inherit;
  text-decoration-color: var(--accent);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.2em;
}

a:hover {
  color: var(--accent-strong);
}

h1,
h2,
h3 {
  margin-block-start: 0;
  font-family: var(--serif);
  font-weight: 500;
  letter-spacing: -0.04em;
  line-height: 1;
  text-wrap: balance;
}

h1 {
  max-width: 11ch;
  font-size: clamp(2.75rem, 13vw, 4.75rem);
}

h2 {
  max-width: 14ch;
  font-size: clamp(2.25rem, 10vw, 4.5rem);
}

.eyebrow,
.section-label,
.entry-type,
.minor-heading,
dt {
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.1em;
  line-height: 1.4;
  text-transform: uppercase;
}

.page-layout,
.work-grid {
  display: grid;
}

.profile {
  padding-block: 3rem;
  border-block-end: 1px solid var(--rule);
}

.work {
  min-width: 0;
  padding-block: 3rem;
}

.work-grid {
  grid-template-columns: minmax(0, 1fr);
  gap: 2.75rem;
  margin: 0;
  padding: 0;
  list-style: none;

  /* Progressive enhancement; item borders below are the fallback. */
  row-rule: 1px solid var(--rule-strong);
  column-rule: 1px solid var(--rule-strong);
}

.work-grid > li {
  min-width: 0;
  padding-block-start: 1.25rem;
  border-block-start: 1px solid var(--rule-strong);
}

.work-entry {
  display: flex;
  min-height: 16rem;
  flex-direction: column;
  padding: 1rem;
  border-radius: 0;
  background: var(--surface);
}

@supports (row-rule: 1px solid currentColor) {
  .work-grid > li {
    padding-block-start: 0;
    border-block-start: 0;
  }
}

@media (min-width: 46rem) {
  .shell {
    width: min(calc(100% - 4rem), var(--page-width));
  }

  .work-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3.5rem 3rem;
  }

  .work-grid__wide {
    grid-column: 1 / -1;
  }
}

@media (min-width: 64rem) {
  .page-layout {
    grid-template-columns: minmax(17rem, 0.75fr) minmax(0, 2fr);
  }

  .profile {
    padding: 5rem clamp(2.25rem, 4vw, 4.5rem) 5rem 0;
    border-block-end: 0;
    border-inline-end: 1px solid var(--rule);
  }

  .work {
    padding: 5rem 0 4rem clamp(2.5rem, 5vw, 5.5rem);
  }
}

```

Use logical properties where practical. Set `min-width: 0` on grid children that
contain long text. Prefer `gap` over margin choreography and CSS over JavaScript
for all layout and presentational behavior.

CSS gap decorations (`row-rule` and `column-rule`) are progressive enhancement.
Always pair them with a simple border fallback and use `@supports` to remove the
fallback only when the decorations are recognized. The design must remain
coherent when the decoration properties are ignored.

## Adaptation rules

Prevent the style from becoming a frozen template:

- Change the column ratio to match the amount of profile and work content.
- Feature only entries that genuinely need more room; do not alternate spans
  mechanically.
- Omit numbering when sequence is not meaningful.
- Omit category colors when there is no useful taxonomy.
- Use a text-only identity when no appropriate image exists.
- Adjust heading scale for the title's length and language.
- Keep existing brand colors when they retain the quiet editorial character and
  clear readability.
- Replace card surfaces with open grid cells when the page has dense content.
- Prefer one excellent content path over extra navigation and ornamental
  sections.

## Quality floor

- Maintain one clear page title and a logical heading hierarchy.
- Keep text, rules, and section labels easy to distinguish.
- Avoid horizontal overflow at common mobile and desktop widths.
- Use descriptive link text instead of repeated bare “Learn more” links.
- Reserve image space to avoid layout shift and optimize image file size.
- Verify that the layout remains coherent without CSS gap-decoration support.

The finished page should feel calm, specific, and edited. If it looks like a
theme marketplace portfolio, a dashboard with personal content inserted, or an
AI-generated stack of interchangeable cards, simplify it.
