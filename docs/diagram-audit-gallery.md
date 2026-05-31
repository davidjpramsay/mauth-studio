# Diagram Audit Gallery

The project keeps a saved test called `DIAGRAM AUDIT GALLERY` under the Files drawer, possibly inside a normal test folder. It is the lightweight visual regression document for diagrams and charts.

Use it after changing:

- JSXGraph coordinate graphs, 2D vectors, or 3D graphs.
- Penrose geometry, network diagrams, or Venn/set diagrams.
- Plotly statistics charts.
- Diagram editor controls, defaults, sizing, labels, alignment, save/load, or print styling.

## Manual Check

1. From the project root, run the app with `pnpm dev:api` and `pnpm dev:web`.
2. Open Files, then open `DIAGRAM AUDIT GALLERY`.
3. Check the written `Expected.` note before each diagram against the rendered diagram.
4. Check display-only view, split preview selection, solution visibility if relevant, and browser print/PDF output for renderer changes that affect print.
5. If a diagram type gains a new important option, add another question to the gallery with a short expected-result note before the diagram.

## Screenshot Smoke

With the API and web dev server already running, capture the key gallery examples with:

```bash
pnpm smoke:diagram-gallery
```

The script locates the gallery through the project-file API, opens the saved project file in Chromium through the Files drawer, switches to display-only view, jumps through the renderer-heavy examples, and writes screenshots to `tmp/verification/diagram-gallery/<timestamp>/`. It deliberately reopens the saved file instead of trusting an already-open autosave draft, so screenshots reflect the canonical audit fixture.

This script is not a replacement for human inspection. It catches obvious load/render failures and gives future agents repeatable screenshots to review.

## Current Output Checks

- Two-set Venn count diagrams should keep the A-total, A-only, intersection, B-only, and B-total values on a common horizontal baseline where practical, while centring each value inside its own visible region or side tab. The total values belong inside the arc-only side tabs, not outside the circles or on their outlines.
- 2D vector graph examples should not show component guide lines unless `showComponents` is deliberately enabled for a question or solution annotation.
