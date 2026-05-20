# Mauthdown

Mauthdown is the source format for editable maths tests. It is Markdown with a small set of explicit containers so humans, AI tools, and the app can all edit the same document without guessing the structure.

The format is intentionally not a Word or Pages clone. It stores test meaning first: title-page data, document formatting config, questions, parts, subparts, marks, choice lists, tables, diagrams, spaces, and page breaks. The app then applies formatting rules when it renders the test.

## File Shape

````md
---
mauthdown: 1
title: "Year 10 Mathematics - Test 2"
exportedAt: "2026-04-30T00:00:00.000Z"
startQuestionNumber: 1
totalMarks: 12
---

# Title Page

:::title-page

```json
{
  "frontMatter": {
    "subjectTitle": "YEAR 10 MATHEMATICS",
    "assessmentTitle": "Test 2"
  },
  "formattingConfig": {
    "id": "high-school-mathematics-test",
    "page": {
      "size": "A4",
      "orientation": "portrait"
    }
  },
  "logo": null
}
```

:::

# Questions

:::question section="Algebra" marks=0
:::text
Factorise $x^2 + 5x + 6$.
:::
:::/question
````

The title-page JSON may contain the full app title-page object, the document `formattingConfig`, and an optional embedded logo. This is deliberate: title-page and print-layout settings are document-level state that should round-trip cleanly for AI and file-management workflows.

In the editor, these document-level settings are shown under `T`: title-page/front-matter controls first, then the `Test format` panel for the saved test preset, mark-label visibility, page size, margins, and page-break-label visibility. This panel is for whole-test structure and print format only; edit question, part, table, diagram, chart, space, and solution layout on the relevant modules.

Title-page text fields support the same maths delimiters as question text: use `$...$` for inline maths and `$$...$$` for display maths in titles, labels, declarations, and instructions. The assessment title style may uppercase normal prose, but LaTeX commands and delimited maths should be preserved exactly.

`frontMatter.titlePageTemplate` controls the document-level title page. Use `"standard"` for the normal single school-test title page. Use `"exam"` for the single supported exam-booklet model: a school-logo cover page, a structure/instructions page, running course/section headers from page 2 onward, question-page footers, cut-off notices, and supplementary pages.

Exam title pages store their extra fields under `frontMatter.exam`. Break AI patches into sensible groups instead of creating fake text blocks at the start of the test. The cover uses the selected `frontMatter.logoId` from the logo bank and `frontMatter.schoolName`; do not leave exam papers logo-less unless the user explicitly asks. Use `frontMatter.exam.sectionPreset` to choose the current paper: `section-one-calculator-free` or `section-two-calculator-assumed`. Section One uses `CALCULATOR-FREE`, five minutes reading time, fifty minutes working time, and no special items. Section Two uses `CALCULATOR-ASSUMED`, ten minutes reading time, one hundred minutes working time, the formula sheet retained from Section One, and calculator/CAS special items. The structure table uses `frontMatter.exam.structureRows`; set `useCurrentDocument: true` on the row that represents the current Mauth document so the preview/print output automatically uses the current question count and total marks. Other rows can remain manual, for example the companion section from the source paper. The app should not silently guess a sister file for companion sections; if linked companion-section support is added later, it should be an explicit file selection with manual override. The percentage column is typed deliberately because it may not equal the current section's mark fraction.

Exam booklets automatically pad their total printed page count to a multiple of four by adding renderer-created supplementary pages at the end. These pages are not editable question content. They use the school-exam supplementary page layout: running header, `Supplementary page`, `Question number: ________`, and the vertical cut-off notice. The last question page footer says `End of questions`; earlier pages from page 2 onward say `See next page`.

When creating a new file, choose the title-page template first. `"standard"` pairs with formatting preset `"high-school-mathematics-test"`. `"exam"` pairs with formatting preset `"exam-booklet"`. Do not approximate exam front matter with ordinary question modules, page breaks, or title-page prose when the exam template can represent it directly.

When converting a past exam, store the front matter as document data, not as question content. Use the school exam booklet layout even for external/ATAR-style source papers unless the user explicitly asks for a different publishing style. For the current section, choose the matching `sectionPreset` and set `frontMatter.exam.structureRows[].useCurrentDocument` to `true`; for other sections from the same source paper, enter the row counts and marks manually unless the user explicitly points to a companion section file.

## Blocks

### Question

```md
:::question section="Algebra" marks=3
...
:::/question
```

Use `marks` on a question only when the question has no parts. If parts exist, the app calculates the question total from the parts and subparts.

### Part

```md
:::part marks=2 pageBreakBefore=false
...
:::/part
```

Part labels are automatic. Do not write `(a)`, `(b)`, etc. as stored labels. Set `pageBreakBefore=true` when this part should deliberately start on a fresh page inside a question. In the editor this is shown as an explicit `Page break` divider row immediately before the part, not as a checkbox on the part row.

### Subpart

```md
:::subpart marks=1 pageBreakBefore=false
...
:::/subpart
```

Subpart labels are automatic. Do not write `(i)`, `(ii)`, etc. as stored labels. Set `pageBreakBefore=true` when this subpart should deliberately start on a fresh page inside a longer question. In the editor this is shown as an explicit `Page break` divider row immediately before the subpart, not as a checkbox on the subpart row.

### Text

```md
:::text
Determine the value of $\int_2^4 f(x)\,dx$.

Markdown **bold** and _italic_ are supported.
:::
```

Use `$...$` for inline maths and `$$...$$` for display maths. Maths renders through MathJax SVG. Inline maths is wrapped with `\displaystyle` by default, so formulas stay in the sentence while fractions and operators use display-style sizing. This is a local wrapper rather than MathJax display mode, because display mode creates block layout. If a specific inline formula needs compact sizing, start it with `\textstyle`.

When converting source papers, preserve the source inline/display choice. Tall inline formulae such as column vectors, matrices, or vector equations should stay inside `$...$` when they are part of a sentence; do not move them to `$$...$$` just to make them larger. Use display maths only for standalone source equations or deliberate working lines.

For vertical systems or grouped display equations, use supported MathJax environments such as `\begin{aligned} ... \end{aligned}`. Do not use `aligned*`. If the rows are cramped, add a small row gap such as `\\[2pt]` or `\\[3pt]`.

TeX still shrinks content inside fraction numerators and denominators. For large nested expressions in printable question text, solution text, table cells, and diagram labels, write the nested expression explicitly in display style, for example `\frac{\displaystyle\binom{n}{r}p^r(1-p)^{n-r}}{\displaystyle\sum_{x=0}^{n} ...}`.

Line breaks inside a text block are preserved in the preview and printed PDF output. When converting source papers, preserve meaningful source line breaks and paragraph breaks. For example, if the original places a second instruction sentence on the next line, keep that as a newline inside the same `:::text` block rather than merging it into one long sentence. Use a blank line inside one `:::text` block when the content is one paragraph group with a deliberate break, rather than creating separate text modules only for spacing.

For solution copies, add `[[marks:n]]` at the end of a mark-worthy text or equation line. The preview hides the raw annotation and renders `n` large red check marks at the right edge of that line. Do not write visible `[1 mark]`, `(1 mark)`, or `Solution (5 marks)` notes in displayed solution prose. Completed solution tables and diagrams can carry `markTicks` so the red check marks render next to the completed surface instead of a following text line.

Ordinary question modules are shared automatically between the student copy and the solution copy: text, choices, given-data tables, and given diagrams remain visible in both. Worked-solution text and diagrams are solution modules. Student answer `:::space` blocks are replaced by adjacent solution modules when the solution-visibility toggle is on. The preview/print layout treats each adjacent answer-space/solution pair as one replacement slot and reserves the larger of the two heights, keeping student and solution pagination matched. If the solution is taller than the student space, the screen preview shows a non-printing warning so the author can shorten the solution or increase the student space deliberately.

Blank answer/completion tables are different from given-data tables. A table with empty cells for students to complete is a response surface, so it may be marked student-only and paired with an adjacent solution module. A table that gives values or information for the question should stay shared.

Graph grids, charts, and diagrams can also be response surfaces. If the task is to sketch a graph, label a diagram, shade a region, draw a function, or complete values directly on a visual surface, the student copy should show the blank or partial surface and the solution copy should show the completed surface in the same position and size. In high-level assistant authoring this is `answerSurface: "diagram"` or `answerSurface: "table"` with a matching `solutionDiagram` or `solutionTable`; no separate large `:::space` block is created unless the question also asks for written working. The high-level authoring layer assigns the completed surface's red ticks from the item marks.

In raw test JSON, solution modules are encoded with `visibility: "solution"` or the legacy `solutionOnly` compatibility field. Ordinary question modules should not be given a copy setting; they stay shared by default. `space` blocks are treated as student answer/work space by default.

When raw test JSON is generated or patched with code, preserve LaTeX backslashes carefully. In JavaScript, use `String.raw` template literals or double escaping for solution text; otherwise commands such as `\frac`, `\boxed`, `\right`, and `\text` can turn into control characters before the JSON is written. After a coded solution pass, validate that solution text contains no unintended control characters and that the sum of all `[[marks:n]]` annotations matches the test total.

The formatted preview uses a slightly open default line height for test text. Do not force tighter paragraph spacing just to save space; add or remove answer-space lines deliberately instead.

When authoring shared student/solution documents, write solutions compactly but give students generous answer space. If a concise worked solution needs more room than the current answer space, increase the adjacent space block lines. Do not stretch solution lines to fill the whole reserved area; unused slot space should remain below the solution. The teacher can manually change space lines and diagram alignment at any time.

For calculator-assumed sections, include calculator-ready intermediate values in worked probability and statistics solutions when they are useful for marking. A conditional probability solution can show the relationship, then the evaluated numerator and denominator, then the final ratio. This is preferable to showing only a large unevaluated binomial sum when the teacher needs to compare student calculator output.

The completion standard for AI-authored tests is strict: every marked item needs a student response surface and a solution. Multiple-choice questions use the choices block as the response surface; free-response questions, parts, and subparts need a real answer/work space at the same structural level as the marks. Blank completion tables can be that response surface when the task is to fill a table. Every worked solution should fit inside its paired student space. If it does not fit after concise writing and sensible side-by-side diagram placement, increase the paired answer-space block.

Solution validation runs as assistant/editor infrastructure. It scans marked questions, parts, and subparts for student response surfaces, solution modules, matched replacement slots, and likely solution-fit problems. Treat this as an AI finish check: after generating or editing solutions, fix validator errors and any avoidable warnings before calling the solution pass complete. The header still shows the current print mode as `Print: Student` or `Print: Solutions`; browser print/PDF output follows that same solution visibility state.

Validator issue cards include quick fixes for common authoring mistakes: add a full student-space/solution slot, add the missing solution after an existing answer space, add the missing answer space before an existing solution, or increase the paired answer-space line count. These fixes follow the same structure expected from AI-authored solution passes.

For assistant/API editing, mark-allocation and solution-only changes must not replace the whole question. Use the solution authoring path so ordinary shared modules, especially diagrams, remain untouched. If the high-level question replacement path is used for a genuine question rewrite, omitted diagram fields preserve existing diagrams; only an explicit empty diagram list or explicit preserve flag set false removes them.

```md
:::text
**Solution.**

$$\frac{dy}{dx}=-3\sin(3x),\qquad m=-3$$ [[marks:2]]

$$\boxed{y=-3x+\frac{\pi}{2}}$$ [[marks:1]]
:::
```

### Choices

```md
:::choices style="roman" layout="vertical"

- $X \sim \operatorname{Bin}(8,0.2)$
- $X \sim \operatorname{Bin}(8,0.8)$
- $X \sim \operatorname{Bin}(8,0.5)$
  :::
```

Use a choices block for answer options inside a single-mark question. Do not use parts/subparts for answer options unless each item is separately assessed.

Supported `style` values are `roman`, `upper-alpha`, `lower-alpha`, `decimal`, and `bullet`.

Supported `layout` values are `vertical`, `two-column`, and `inline`.

### Table

```md
:::table align="center" cellAlign="center"
| $x$ | 0 | 1 |
| $P(X=x)$ | $1-p$ | $p$ |
:::
```

Use a table block for structured values, probability tables, sign tables, or working tables. Cells use the same authoring rules as text blocks: `$...$` for inline maths, `$$...$$` for display maths, and Markdown bold/italic where useful.

Supported `align` values are `left`, `center`, and `right`.

Supported `cellAlign` values are `left`, `center`, and `right`.

Tables are currently plain grids: the first row is an ordinary row, not a special header row.

### Space

```md
:::space lines=4
:::
```

The renderer converts this into answer/work space.

When one document holds both the student copy and solution copy, keep answer spaces as student answer `:::space` blocks rather than deleting them. Put the corresponding worked-solution module immediately before or after that space block when the two copies must reserve identical layout space.

Prefer generous answer spaces for students, especially in questions that require multi-line working. If a solution does not fit the matched slot after it has been written concisely, increase this space block rather than allowing only the solution copy to reflow.

If a diagram should sit beside the answer/solution area, align the diagram left or right and place the adjacent answer-space/solution pair immediately after the diagram. The renderer treats the diagram plus paired answer/solution area as one response slot: the student copy shows one L-shaped working area beside and under the diagram, and the solution copy fills that same slot with worked solution content that wraps beside the diagram and then continues underneath.

### Page Break

```md
:::page-break
:::
```

Page breaks between questions are attached after the current question and are managed in the mini TOC. To split a long question at a deliberate point, use the question editor's `Page break` divider row before the relevant part or subpart; this stores as `pageBreakBefore=true` on the following part/subpart. Do not insert standalone page-break blocks inside a question.

## Diagrams

### 2D Graphs and Other JSON Diagrams

````md
:::diagram type="graph2d" align="center"

```json
{
  "type": "graph2d",
  "functions": [
    {
      "kind": "expression",
      "expression": "x^2 - 5*x + 6",
      "label": "f",
      "color": "#0f766e"
    }
  ],
  "xMin": -5,
  "xMax": 4,
  "yMin": -3,
  "yMax": 8
}
```

:::
````

Supported alignment values are `left`, `center`, and `right`. `centre` is accepted on import and normalised to `center`.

For source slope-field or direction-field diagrams, use `graph2d.data.slopeField` rather than many unrelated `line_segment` features:

```json
{
  "type": "graph2d",
  "xMin": -2,
  "xMax": 2,
  "yMin": -2,
  "yMax": 2,
  "data": {
    "slopeField": {
      "expression": "(x - 1) / (2*y)",
      "xValues": [-1.5, -0.5, 0.5, 1.5],
      "yValues": [-1.5, -0.5, 0.5, 1.5],
      "highlightedPoints": [{ "x": 0.5, "y": -1, "slope": 0.25, "label": "$(0.5,-1)$" }]
    }
  },
  "functions": [{ "kind": "relation", "expression": "y^2 = x^2/2 - x + 1/4", "label": "solution" }]
}
```

Use `xRange`/`yRange` plus `xStep`/`yStep` when the source uses a regular field over an interval. Use `highlightedPoints` for a particular slope segment that the student is asked to calculate or draw. When the source asks for an implicit solution curve, prefer a relation function such as `{ "kind": "relation", "expression": "y^2 = x^2/2 - x + 1/4" }` over separate `sqrt(...)` branches.

For `graph2d`, graph bounds (`xMin`, `xMax`, `yMin`, `yMax`), size (`widthPx`, `heightPx`), axes/grid display flags, `functions`, and `features` are top-level diagram JSON fields. Only renderer-specific data such as `slopeField` belongs under `data`. Do not put `functions` or `features` under `data`, do not put axes/size fields under `options`, and use `domainMin`/`domainMax` plus `color`/`strokeWidth`/`strokeStyle` directly on each function rather than `domain` or `style` wrapper fields. Graph features use `kind`, not `type`, and feature style fields such as `color`, `size`, and `strokeWidth` also live directly on the feature. Free labels use `kind: "label"` with `x`/`y`; line segments use `kind: "line_segment"` with `x1`/`y1`/`x2`/`y2`. For shaded regions and loci, define boundary curves/rays in `functions`, then use exact supported feature kinds such as `region_between_curves`, `region_curve_axis`, or `region_clipped_by_curve` with `xMin`/`xMax` bounds, function indices, and `fillOpacity`; fields and feature kinds such as `region_between`, `polygon`, `free_label`, `points`, `coords`, `functionIndex1`, `functionIndex2`, feature `domainMin`/`domainMax`, `expressionTop`, `expressionBottom`, `opacity`, `fillColor`, and `strokeColor` are not part of the graph2d feature schema. For Argand loci, preserve the source or marking-key argument reference; a locus can combine a shifted circle such as `|z-i| <= 2` with sector bounds such as `Arg(z)`, so do not rewrite the argument expression unless the source does.

For `graph3d` diagrams, the live preview persists the teacher's rotated camera in `metadata.view3d`:

```json
{
  "type": "graph3d",
  "data": {
    "points": [
      { "id": "O", "label": "O", "coords": [0, 0, 0] },
      { "id": "A", "label": "A", "coords": [2, 0, 0] },
      { "id": "B", "label": "B", "coords": [2, 4, 0] },
      { "id": "T", "label": "T", "coords": [0, 0, 3] }
    ],
    "segments": [
      { "from": "O", "to": "A" },
      { "from": "A", "to": "B" },
      { "from": "B", "to": "T", "label": "$BT$" }
    ],
    "faces": [{ "points": ["O", "A", "B"], "fillColor": "#dbeafe", "fillOpacity": 0.16 }],
    "solids": [
      { "kind": "cone", "baseCenter": "O", "apex": "T", "radius": 2 },
      { "kind": "sphere", "center": [1, 2, 1.5], "radius": 2.69 }
    ],
    "xRange": [-1, 3],
    "yRange": [-1, 5],
    "zRange": [-1, 4]
  },
  "metadata": {
    "view3d": {
      "az": 1.35,
      "el": 0.42,
      "bank": 0
    }
  }
}
```

Preserve this metadata when editing 3D diagrams so the printed PDF uses the same view as the screen preview. `metadata.view3d` is the renderer-native camera shape and must contain numeric `az`, `el`, and `bank` fields in renderer/radian-style units, not degrees; values such as `az: 1.1`, `el: 0.35`, and `bank: 0` are plausible. Nested `camera.eye` metadata is not read by the renderer.

The editor treats `graph3d` as its own renderer family. It exposes diagram width, diagram height, and the stored camera values `az`, `el`, and `bank`. For source 3D coordinate geometry, put named vertices in `data.points` and visible joins in `data.segments`; use `strokeStyle: "dashed"` or `dashed: true` for hidden edges, not a segment `style` field. Use `data.faces` for polygon faces on prisms and pyramids, and `data.solids` for curved solids with `kind: "cone"`, `"cylinder"`, `"sphere"`, `"circle"`, or `"sphereCap"`. Cone/cylinder solids use `baseCenter`, `apex` or `topCenter`, and `radius`; spheres/circles use `center` and `radius`, with optional `normal` for circles. Solids accept `renderStyle: "surface"`, `"wireframe"`, or `"outline"` so source diagrams can choose filled surfaces or clean outline-only sketches. Dimension annotations such as height `h` and radius `r` belong in `data.dimensions` as `{ from, to, label, strokeStyle? }`; they render as labelled guide lines and can use point ids or coordinate triples. Spherical caps use `kind: "sphereCap"` with `center`, `radius`, `height`/`depth`, and `axis`/`normal`; do not represent a cap as a full sphere unless the source actually shows the whole sphere. Do not leave a source prism, pyramid, cone, cylinder, sphere, or spherical cap as a camera-only placeholder. Do not add 2D graph functions, 2D axes options, metadata `axisLabels`/`showAxes`/`showGrid`, `xAxis`/`yAxis`/`zAxis` helper points or axis-label segments, or vector2d metadata to a `graph3d` diagram.

### Image Diagrams

Uploaded images use `type="image"`. The current editor stores the uploaded image as a data URL inside the diagram config; the future project/file system should move large assets into proper asset storage.

```json
{
  "type": "image",
  "data": {
    "src": "data:image/png;base64,...",
    "name": "diagram.png",
    "alt": "Uploaded diagram",
    "mimeType": "image/png"
  },
  "widthPx": 320,
  "heightPx": 220
}
```

For solution-only graph annotations, use normal graph features such as red points, labels, and `line_segment` guide lines inside the diagram JSON rather than drawing ad hoc SVG. Mark those features as `solutionOnly` in the editor so the solution-visibility toggle can hide them for the student copy while keeping the diagram editable.

Example solution guide line feature:

```json
{
  "kind": "line_segment",
  "x1": 1,
  "y1": 3,
  "x2": 1,
  "y2": 0,
  "color": "#c1121f",
  "strokeStyle": "dashed",
  "strokeWidth": 1.5,
  "label": "$x_1=1$",
  "labelMode": "name"
}
```

### Statistics Charts

Statistics charts use `type="statsChart"` and a JSON chart DSL. The app converts the DSL into a controlled Plotly configuration with worksheet-style fonts, margins, axis lines, and grid rules.

For histogram/column graph displays:

- `barType="continuous"` treats bars as continuous bins.
- `barType="discrete"` treats each distinct value as a separate column.
- `yAxisMode="frequency"` plots counts.
- `yAxisMode="relativeFrequency"` plots counts divided by the sample size.
- `yLabelOrientation="vertical"` keeps the y-axis label rotated on the left.
- `yLabelOrientation="horizontal"` places the y-axis label horizontally near the top-left of the chart.
- `dataMode="raw"` calculates bars from `values`.
- `dataMode="manualFrequencies"` plots exact frequency columns from matching `xValues` and `frequencies`.
- `dataMode="manualProbabilities"` plots exact probability columns from matching `xValues` and `probabilities`.

Histogram / column graph from raw values:

````md
:::diagram type="statsChart" align="center"

```json
{
  "type": "statsChart",
  "data": {
    "chartType": "histogram",
    "barType": "continuous",
    "dataMode": "raw",
    "yAxisMode": "frequency",
    "yLabelOrientation": "vertical",
    "values": [3, 5, 7, 7, 8, 10],
    "bins": 2,
    "xLabel": "Score",
    "yLabel": "Frequency"
  },
  "options": {
    "showGrid": true,
    "showFill": true,
    "fillColor": "#f5f5f5",
    "fillOpacity": 1
  }
}
```

:::
````

For histograms, `bins` means the exact number of intervals. If `binSize` is supplied instead, it means the exact interval width. The app precomputes the interval counts before handing the chart to Plotly so Plotly does not silently choose a different bin layout.

Manual frequency columns:

````md
:::diagram type="statsChart" align="center"

```json
{
  "type": "statsChart",
  "data": {
    "chartType": "histogram",
    "barType": "continuous",
    "dataMode": "manualFrequencies",
    "yAxisMode": "frequency",
    "xValues": [270, 290, 310],
    "frequencies": [4, 8, 10],
    "binSize": 20,
    "xLabel": "$W$",
    "yLabel": "Frequency"
  }
}
```

:::
````

Manual probability columns:

````md
:::diagram type="statsChart" align="center"

```json
{
  "type": "statsChart",
  "data": {
    "chartType": "histogram",
    "barType": "discrete",
    "dataMode": "manualProbabilities",
    "yAxisMode": "relativeFrequency",
    "yLabelOrientation": "horizontal",
    "xValues": [2, 4, 5, 6, 7],
    "probabilities": [0.1, 0.25, 0.3, 0.15, 0.2],
    "xLabel": "$x$",
    "yLabel": "$P(X=x)$"
  }
}
```

:::
````

Use `showFill=false` for no fill. Use `fillColor` and `fillOpacity` for shaded bars, box plots, and distribution displays. The old `blackAndWhite` and `interactive` chart options may still appear in legacy files, but new authoring should use the fill and grid options above; chart interactivity is disabled for assessment output.

Normal distribution:

````md
:::diagram type="statsChart" align="center"

```json
{
  "type": "statsChart",
  "data": {
    "chartType": "normal",
    "mean": 0,
    "stdDev": 1,
    "range": [-3, 3],
    "xLabel": "z",
    "yLabel": "Density"
  }
}
```

:::
````

Arbitrary probability density curve from source points:

````md
:::diagram type="statsChart" align="center"

```json
{
  "type": "statsChart",
  "data": {
    "chartType": "density",
    "points": [
      { "x": 150, "y": 0 },
      { "x": 180, "y": 0.02 },
      { "x": 210, "y": 0 }
    ],
    "range": [150, 210],
    "yRange": [0, 0.03],
    "xLabel": "Response length",
    "yLabel": "Density"
  }
}
```

:::
````

Blank statistics axes for a student sketch:

````md
:::diagram type="statsChart" align="center"

```json
{
  "type": "statsChart",
  "data": {
    "chartType": "blankAxes",
    "range": [2.1, 2.7],
    "yRange": [0, 4],
    "xLabel": "$\\overline{x}$",
    "yLabel": "Density"
  }
}
```

:::
````

Binomial distribution:

````md
:::diagram type="statsChart" align="center"

```json
{
  "type": "statsChart",
  "data": {
    "chartType": "binomial",
    "trials": 10,
    "probability": 0.5,
    "xLabel": "x",
    "yLabel": "Probability"
  }
}
```

:::
````

Box plot:

````md
:::diagram type="statsChart" align="center"

```json
{
  "type": "statsChart",
  "data": {
    "chartType": "box",
    "values": [1, 2, 3, 4, 5, 6, 7],
    "xLabel": "Value",
    "yLabel": ""
  }
}
```

:::
````

### Penrose Geometry Diagrams

````md
:::diagram type="geometricConstruction" align="center" scale=100

```penrose
Point centre, A, B, C
Circle gamma
Line tangentA

Label centre $\,$
Label A $A$
Label B $B$
Label C $C$
Label gamma $\Gamma$

HidePoint(centre)
CircleThrough(gamma, centre, A)
OnCircle(B, gamma)
OnCircle(C, gamma)
Tangent(tangentA, gamma, A)
```

:::
````

The app supplies the geometry Domain and Style preset. For normal use, edit only Substance.

For tangent-parallel-chord diagrams, use `ParallelToSegment(tangentA, B, C)` so the chord stays a segment while Penrose still constrains it to be parallel to the tangent. Hide auxiliary construction points such as a centre point unless the question names them.

Equal-length side marks use the geometry preset's `EqualLength` predicate:

```penrose
Point L, V, R
NamedSegment VL, VR
Label angleTheta $\theta$

Triangle(L, V, R)
Segment(VL, V, L)
Segment(VR, V, R)
EqualLength(VL, VR)
AngleMark(L, V, R)
LabelsAngle(angleTheta, L, V, R)
```

This constrains the two sides to be equal and draws matching tick marks. Point labels are optional; if a `Point` or `Circle` has no `Label` statement, Mauth adds an invisible label before sending the diagram to Penrose. Named segments are useful for readable side relationships.

Angle and side label declarations are also inferred when the label is placed by `LabelsAngle`, `LabelsSegment`, `LabelsCircle`, or `LabelsLine`. For example, `Label angleTheta $\theta$` plus `LabelsAngle(angleTheta, L, V, R)` is enough; Mauth adds `LengthLabel angleTheta` before sending the Substance to Penrose.

If the same displayed side label is needed in two places, reuse the same label name and Mauth will create internal copies for Penrose:

```penrose
Label a $a$
LabelsSegment(a, AB)
LabelsSegment(a, AC)
```

Point dots are shown by default. Hide individual point dots with `HidePoint(A)`, or hide several with the Mauth shorthand:

```penrose
HidePoints(A, B, C)
```

Use numbered predicates when the mark convention needs two or three ticks/arcs:

```penrose
NamedSegment AB, CD
Segment(AB, A, B)
Segment(CD, C, D)

EqualLength(AB, CD)       -- one side tick on AB and CD
EqualLength2(AB, CD)      -- two side ticks on AB and CD
EqualLength3(AB, CD)      -- three side ticks on AB and CD

Label sideAB $a$
LabelsSegment(sideAB, AB) -- label a named segment

AngleMark(A, B, C)        -- one angle arc at B
AngleMark2(A, B, C)       -- two angle arcs at B
AngleMark3(A, B, C)       -- three angle arcs at B
```

The older compact predicates still work, but they are less readable:

```penrose
EqualLength(A, B, C, D)   -- segment AB equals segment CD
EqualLength2(A, B, C, D)
EqualLength3(A, B, C, D)
```

Angle and side text labels are rendered as LaTeX. For example, `Label angleTheta $\theta$` renders the theta symbol, and side units can be written as `Label sideAB $5\text{ cm}$`.

### Penrose Set Diagrams

Set diagrams use the `sets` preset. The normal path is structured two-set Venn data: universe label, set labels, optional total badges, region labels/counts, and standard shaded-region flags. A new Set Diagram block starts with a two-set Venn diagram and labels for the four standard regions. Use Advanced Substance only for unusual set diagrams outside those controls.

````md
:::diagram type="setDiagram" align="center" scale=100

```penrose
Universe U
Set A, B
RegionLabel onlyA, intersection, onlyB, outside

Label U $U$
Label A $A$
Label B $B$
Label onlyA $A \cap B'$
Label intersection $A \cap B$
Label onlyB $A' \cap B$
Label outside $(A \cup B)'$

Venn(U, A, B)
LabelsLeftOnly(onlyA, A, B)
LabelsIntersection(intersection, A, B)
LabelsRightOnly(onlyB, A, B)
LabelsOutside(outside, U, A, B)
```

:::
````

The API also accepts an empty set diagram spec, such as `{ "type": "setDiagram", "data": {} }`, and fills in the same default `A` and `B` overlapping-set structure.

Two-set Venn diagrams can shade the standard regions. In generated diagram data, set `shaded: true` on the matching region. In explicit Penrose Substance, use these predicates:

```penrose
ShadeLeftOnly(A, B)
ShadeIntersection(A, B)
ShadeRightOnly(A, B)
ShadeOutside(U, A, B)
```

Use actual region shading for shaded Venn questions rather than relying on labels such as "shade A cap B".

Venn labels render as plain dark mathematical text. Do not add a white stroke, halo, or label background over shaded regions unless a specific custom diagram deliberately asks for that style.

Place Venn region labels cleanly. Use wider default positions for set-notation region labels such as `A\cap B'`, `A\cap B`, and `A'\cap B` so they sit away from circle outlines. When set-total side tabs are present and the regions contain numeric counts, keep the A-total, A-only, intersection, B-only, and B-total values on a common horizontal baseline where practical, but centre each value inside its own visible region or side tab rather than distributing the labels as one evenly spaced row. Put the set labels `A` and `B` just outside the top of their circles rather than inside the circle regions, and put the outside-region label near the lower-right of the universal rectangle.

Set diagrams also support simple total badges in generated diagram data. Put `countLabel`, `count`, `total`, or `totalLabel` on `universe` to show a small square total box attached to the top-right corner of the universal set, and put one of those fields on a set to show a small arc-only semicircle side-tab count badge attached to that set.

Use those badges only when the question needs that information. The preferred school style is a square badge attached to the top-right of the universal rectangle for `n(U)`, the total number of elements, or occasionally `U` when requested; set totals such as `n(A)` and `n(B)` use small semicircle side tabs attached to the outside edge of the corresponding set circle. The side tabs are just arcs attached to the set circle, with no straight chord line, and their count sits visually centred inside the semicircle tab rather than outside the diagram or on a region boundary. Ordinary region values for A-only, intersection, B-only, and outside should normally sit as plain labels inside their regions, with the outside value near the lower-right of the universal rectangle. If a later diagram needs A-only or B-only tab-style placeholders, follow the same small semicircle side-tab convention deliberately rather than adding badges by default.

Venn text uses a 10 pt-equivalent maths size to match the rest of the document. The renderer compensates that label size against both diagram `scalePercent` and the default display scale, so scaling the diagram changes the geometry size without making the labels grow or shrink as well.

For the custom two-set Venn renderer, `scalePercent=100` is the normal classroom size and displays the 420 by 300 SVG canvas at 80% by default. This keeps the Venn geometry about 20% smaller while preserving document-sized labels.

The web editor exposes the common two-set Venn controls directly. Use the quick buttons for set-notation labels, count regions, count regions with total badges, and one-shaded-region presets. Ordinary labels, optional `U` total box, optional `A`/`B` total tabs, region labels/counts, and shading are stored as separate structured fields. Editing those controls clears any custom Substance override and returns the diagram to structured set data.

```json
{
  "type": "setDiagram",
  "data": {
    "universe": { "name": "U", "label": "U", "countLabel": "30" },
    "sets": [
      { "type": "set", "name": "A", "label": "A", "countLabel": "18" },
      { "type": "set", "name": "B", "label": "B", "countLabel": "16" }
    ],
    "regions": [
      { "name": "onlyA", "label": "8" },
      { "name": "intersection", "label": "10" },
      { "name": "onlyB", "label": "6" },
      { "name": "outside", "label": "6" }
    ]
  }
}
```

### Network Diagrams

Use `network` for schematic network diagrams where layout is conceptual rather than coordinate-accurate. Use `VectorSegment(name, start, end)` for directed links and `Segment(name, start, end)` for undirected links.

The web editor exposes the common network controls directly: diagram scale, node rows, node labels, show/hide node dots, show/hide node labels, directed/undirected link rows, from/to nodes, and link labels. Use Advanced Substance only when the relationship diagram needs custom Penrose constraints beyond ordinary nodes and links.

```penrose
Point A, B, C
NamedSegment AB, AC, BC
LengthLabel abLabel

Label A $A$
Label B $B$
Label C $C$
Label abLabel $p$

VectorSegment(AB, A, B)
VectorSegment(AC, A, C)
Segment(BC, B, C)
LabelsSegment(abLabel, A, B)
```

### 2D Vector Graphs

Use `vector2d` for coordinate-accurate vectors on axes. This is the right diagram type for vectors such as $\mathbf{a}=\begin{pmatrix}2\\3\end{pmatrix}$ starting at the origin, vectors starting at another point, vector addition, and scale-sensitive coordinate work. Its grid and axes use the same clean major/minor-grid defaults as ordinary 2D function graphs.

For both `graph2d` and `vector2d`, the axis-letter labels `x` and `y` are rendered through MathJax so they match the rest of the mathematical notation. Tick numbers remain plain axis tick labels.

Set `equalScale: true` whenever the visual angle or perpendicularity of vectors matters, including source-faithful scalar-product ray diagrams. This preserves the same screen scale in the x- and y-directions so angle arcs and right-angle markers match the vector relationships.

The default label style is `boldLower`, which renders labels such as $\mathbf{a}=\begin{pmatrix}2\\3\end{pmatrix}$. Use `arrow` when the notation should be a directed segment label such as $\overrightarrow{AB}=\begin{pmatrix}2\\3\end{pmatrix}$. Use `custom` only when each vector needs a fully custom LaTeX label. Vector labels, segment labels, and angle labels are draggable in the preview; manual label positions are stored as `labelX` and `labelY` on the vector, segment label, or angle marker.

Dotted component guide lines are available per vector with `"showComponents": true`, but leave them off by default. Use them only for solution annotations or questions that explicitly need the vector components shown. In the editor, component guides live under Annotations rather than the core vector row.

Angle and perpendicular markings are controlled by `metadata.vector2d.angleMarkers`. Each marker chooses a `from` vector and a `to` vector; use `rightAngle: true` for a perpendicular marker, or leave it false and supply a label such as `45^\circ` for a normal angle arc. The `from`/`to` ids should be the two rays that bound the visible marking, such as `b` to `d` for a right-angle square showing $\mathbf{b}\perp\mathbf{d}$, and `c` to `d` for a labelled $45^\circ$ arc between those rays. The editor exposes these as manual Annotations controls with marker radius, colour, and optional draggable label position.

The editor provides structured presets for common coordinate-vector diagrams: single vector, two vectors from the origin, vector addition triangle, and component-guide solution. These presets only write normal `graphConfig.metadata.vector2d` data, so AI tools can use a preset first and then patch vector names, starts, components, colours, label positions, or axis bounds.

```json
{
  "type": "vector2d",
  "xMin": -1,
  "xMax": 6,
  "yMin": -4,
  "yMax": 4,
  "metadata": {
    "vector2d": {
      "labelStyle": "boldLower",
      "vectors": [
        {
          "id": "a",
          "name": "a",
          "start": [0, 0],
          "components": [2, 3],
          "color": "#0f766e"
        },
        {
          "id": "b",
          "name": "b",
          "start": [0, 0],
          "components": [4, -3],
          "color": "#b45309"
        }
      ]
    }
  }
}
```

### Diagram Beside Text

Left- or right-aligned diagrams automatically render the next text block, answer-space block, or student/solution replacement slot beside the diagram in the formatted preview and print path. The adjacent content is placed on the opposite side of the diagram. This is intended for assessment layout: put a diagram on the right or left, then keep the related answer space or solution slot immediately after it so the renderer can use the remaining horizontal space. When converting a source paper, preserve a graph's intentional left/right alignment unless it creates a clear layout problem.

````md
:::diagram type="geometricConstruction" align="right" scale=100

```penrose
Point A, B, C
Triangle(A, B, C)
```

:::

:::text
**Solution.**

Worked solution text appears to the left of the right-aligned diagram.
:::
````

This uses a stable diagram response slot: the diagram is floated once, blank answer space is drawn as one L-shaped reserved area beside and under the diagram, and worked-solution text fills the same slot by wrapping beside the diagram before continuing at full width underneath. Use it for solution copies where a student version left working room beside a diagram. Also use it for diagrams created only by the worked solution: store the diagram as a solution module, put the worked-solution text immediately after it, and align the diagram left or right so the solution wraps around the diagram instead of stacking below it or staying trapped in a narrow column.

## AI Authoring Rules

- Prefer explicit containers over headings when creating tests.
- Do not store automatic labels for questions, parts, or subparts.
- Use marks as numeric attributes.
- Put graph configs in `json` fences.
- Put Plotly-backed statistics charts in `statsChart` JSON diagram blocks.
- Put structured tabular values in `:::table` blocks rather than faking a table with spacing in text.
- Put Penrose geometry, network, and set diagrams in `penrose` fences.
- Treat `:::space` blocks as intentional working area. Do not add a trailing question-level space block immediately before a manual page break; the leftover page area already provides working room.
- Keep `:::space` blocks inside parts/subparts when they are the intended answer area for that specific part.
- Ordinary question text, choices, tables, and given diagrams are shared by default between the student copy and solution copy. Only answer spaces and worked-solution modules change when solutions are shown.
- Blank answer/completion tables are response surfaces and may be student-only; given-data tables stay shared.
- Treat `:::space` blocks as student answer/work space by default. In marked free-response questions, parts, and subparts, the editor's Add -> Answer + solution action is the normal response-space action: it creates a paired answer-space block followed by a solution text block beginning with `**Solution.**`. The Add -> Solution slot action creates the same pair in places where a separate explicit slot action is shown; adjust the prompted line count when the default is not enough.
- Every marked item needs a student response surface. For multiple-choice items this is the Choice List; for free-response items this is a generous `:::space` block at the same question/part/subpart level as the marks.
- Every marked item needs a solution or answer key entry when creating a solution-enabled document.
- Be generous with student answer space. If a concise solution needs more reserved room, increase the matching answer-space block lines so both copies keep the same pagination.
- A worked solution should fit inside its matched student slot. Resolve overflow by tightening the solution, using side-by-side diagram placement where appropriate, or increasing the paired answer space.
- Keep worked solutions compact and mark-focused. Do not stretch solution content to fill the full student working space; leave unused reserved space after the solution.
- Use automatic left/right diagram placement for side-by-side solution text beside given diagrams or solution-only diagrams. Blank answer spaces beside diagrams render as one L-shaped response slot that uses the side area first and then continues underneath. The solution copy fills that same slot. Do not fake this with separate space blocks.
- Preserve manual user changes to space lines and diagram alignment unless they clearly break the document.
- In solution copies, annotate mark-worthy lines with `[[marks:n]]` rather than writing visible ticks manually.
- When generating raw JSON with code, use raw strings or double escaping for LaTeX and verify there are no unintended control characters in solution text.
- Prefer named segments for equal-length marks: `NamedSegment AB, CD`, `Segment(AB, A, B)`, then `EqualLength(AB, CD)`.
- Use `EqualLength2(AB, CD)` or `EqualLength3(AB, CD)` for two or three side ticks.
- The older `EqualLength(A, B, C, D)` form is still supported for compatibility, but avoid it in new AI-authored content.
- Use `AngleMark(A, B, C)`, `AngleMark2(A, B, C)`, or `AngleMark3(A, B, C)` for matching angle arc marks.
- Keep title-page settings in the `title-page` JSON block.
- Do not paste rendered SVG, PDF, or image output into Mauthdown unless the app later adds an image block type.

## Import Behaviour

The importer first looks for authored Mauthdown containers such as `:::question`. If found, those containers are the source of truth. Older exports with a hidden `mauthdown-json` block are still accepted as a fallback for compatibility.
