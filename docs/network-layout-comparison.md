# Network layout comparison — 28 October 2026

Mauth now uses Penrose core 3.3.1. The upgrade includes upstream memory fixes; Mauth's label and Resample fixes are separate changes. See the [Penrose release notes](https://github.com/penrose/penrose/releases/tag/v3.3.1).

The reproducible comparison uses the same four mathematical graphs in both engines: the five-node/seven-edge showcase, a six-node tree, directed links with a self-loop, and nonplanar K3,3. Each runs five deterministic seeds. Nodes, directions and weights are identical. Mauth uses its new candidate ranking and automatic labels; Graphviz 16.1.0 uses `neato` through Viz.js 3.31.0, external node/edge labels, overlap removal, straight links and a 130-unit target length. Text is 16.133 units with comparable dot/stroke sizes. Penrose uses MathJax; Graphviz uses Times text. See [neato](https://graphviz.org/docs/layouts/neato/) and [Viz.js](https://github.com/mdaines/viz-js/releases/tag/release-viz-3.31.0).

| Observed across 20 renders per engine | Mauth / Penrose | Graphviz / neato |
| ------------------------------------- | --------------: | ---------------: |
| Mean render time, warm libraries      |          535 ms |             2 ms |
| Maximum render time                   |        1,417 ms |            12 ms |
| Label-box / label-box intersections   |               0 |                0 |
| Label-box / node intersections        |               0 |                0 |
| Label-box / edge intersections        |               0 |              116 |
| Crossing edge pairs                   |              16 |               18 |

Timing includes layout and SVG production, excluding library initialisation and browser measurement. These are local observations, not performance guarantees. Bounding-box intersections are conservative and do not count actual glyph pixels. Crossings are per edge pair, not per sampled segment. Loop circles/curves and arrowheads are omitted from the comparison metrics for parity; Mauth's own placement additionally avoids loops and arrowhead bounds. Label association still needs visual review. K3,3 cannot be drawn without crossings; neither engine found the optimal one-crossing drawing in these seeds. The showcase has one total crossing across five Penrose layouts, versus three for Graphviz. Both trees have zero.

Graphviz is a credible fast network-layout backend, but this configuration does not remove Mauth's need for its own label placement and teacher controls. Keep Penrose for constraint geometry and the current network renderer. If introducing a dedicated Graphviz network tool later, reuse stable label identities, draggable offsets, solution visibility and the shared history/actions contract, and compare more graph sizes and Graphviz engines. This experiment does not establish that Penrose is intrinsically better, or that either engine guarantees the best layout.

Run from the repository root:

```bash
pnpm compare:network-layouts /tmp/mauth-network-comparison
```

The command writes all SVGs, Graphviz inputs, measurements, a side-by-side HTML report and a full report screenshot. It does not access or mutate teacher documents. The shared fixtures live in `packages/diagram-penrose/fixtures/network-comparison.mjs`; generated outputs remain outside source control. Graphviz is a development dependency and is not included in the installed renderer.
