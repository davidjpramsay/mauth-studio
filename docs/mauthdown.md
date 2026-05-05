# Mauthdown

Mauthdown is the source format for editable maths tests. It is Markdown with a small set of explicit containers so humans, AI tools, and the app can all edit the same document without guessing the structure.

The format is intentionally not a Word or Pages clone. It stores test meaning first: title-page data, questions, parts, subparts, marks, choice lists, tables, diagrams, spaces, and page breaks. The app then applies formatting rules when it renders the test.

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

The title-page JSON may contain the full app title-page object. This is deliberate: the title page has several configurable fields and an optional embedded logo.

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
:::part marks=2
...
:::/part
```

Part labels are automatic. Do not write `(a)`, `(b)`, etc. as stored labels.

### Subpart

```md
:::subpart marks=1
...
:::/subpart
```

Subpart labels are automatic. Do not write `(i)`, `(ii)`, etc. as stored labels.

### Text

```md
:::text
Determine the value of $\int_2^4 f(x)\,dx$.

Markdown **bold** and _italic_ are supported.
:::
```

Use `$...$` for inline maths and `$$...$$` for display maths. Inline maths renders with `\displaystyle` by default while keeping KaTeX inline mode, so formulas stay in the sentence but fractions and operators use display-style sizing. If a specific inline formula needs compact KaTeX sizing, start it with `\textstyle`.

Line breaks inside a text block are preserved in the preview/export. Use a blank line inside one `:::text` block when the content is one paragraph group with a deliberate break, rather than creating separate text modules only for spacing.

For solution copies, add `[[marks:n]]` at the end of a mark-worthy text or equation line. The preview hides the raw annotation and renders `n` large red check marks at the right edge of that line.

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
:::table header=true align="center" cellAlign="center"
| $x$ | 0 | 1 |
| $P(X=x)$ | $1-p$ | $p$ |
:::
```

Use a table block for structured values, probability tables, sign tables, or working tables. Cells use the same authoring rules as text blocks: `$...$` for inline maths, `$$...$$` for display maths, and Markdown bold/italic where useful.

Supported `align` values are `left`, `center`, and `right`.

Supported `cellAlign` values are `left`, `center`, and `right`.

Set `header=false` for a table without a visible header row.

### Space

```md
:::space lines=4
:::
```

The renderer converts this into answer/work space.

### Page Break

```md
:::page-break
:::
```

Page breaks are currently attached after the current question when imported.

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

For solution-only graph annotations, use normal graph features such as red points, labels, and `line_segment` guide lines inside the diagram JSON rather than drawing ad hoc SVG. This keeps the diagram editable after import.

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
Point O, A, B, C
Circle gamma
Line tangentA

Label O $O$
Label A $A$
Label B $B$
Label C $C$
Label gamma $\Gamma$

CircleThrough(gamma, O, A)
OnCircle(B, gamma)
OnCircle(C, gamma)
Tangent(tangentA, gamma, A)
Segment(O, A)
```

:::
````

The app supplies the geometry Domain and Style preset. For normal use, edit only Substance.

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

Set diagrams use the `sets` preset, so the author normally edits only Substance. A new Set Diagram block starts with a two-set Venn diagram and labels for the four standard regions.

````md
:::diagram type="setDiagram" align="center" scale=100

```penrose
Universe U
Set A, B
RegionLabel onlyA, intersection, onlyB, outside

Label U $U$
Label A $A$
Label B $B$
Label onlyA $A \setminus B$
Label intersection $A \cap B$
Label onlyB $B \setminus A$
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

### Diagram Beside Text

Use `textSide="left"` or `textSide="right"` on a diagram block to render the next text block beside the diagram in the formatted preview/export path.

````md
:::diagram type="geometricConstruction" align="right" scale=100 textSide="left"

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

This is intentionally a stable two-column layout, not freeform text wrapping. Use it for solution copies where a student version left working room beside a diagram.

## AI Authoring Rules

- Prefer explicit containers over headings when creating tests.
- Do not store automatic labels for questions, parts, or subparts.
- Use marks as numeric attributes.
- Put graph configs in `json` fences.
- Put Plotly-backed statistics charts in `statsChart` JSON diagram blocks.
- Put structured tabular values in `:::table` blocks rather than faking a table with spacing in text.
- Put Penrose geometry, vector, and set diagrams in `penrose` fences.
- Treat `:::space` blocks as intentional working area. Do not add a trailing question-level space block immediately before a manual page break; the leftover page area already provides working room.
- Keep `:::space` blocks inside parts/subparts when they are the intended answer area for that specific part.
- Use diagram `textSide` for stable side-by-side solution text beside left/right diagrams instead of trying to fake text wrap with spaces.
- In solution copies, annotate mark-worthy lines with `[[marks:n]]` rather than writing visible ticks manually.
- Prefer named segments for equal-length marks: `NamedSegment AB, CD`, `Segment(AB, A, B)`, then `EqualLength(AB, CD)`.
- Use `EqualLength2(AB, CD)` or `EqualLength3(AB, CD)` for two or three side ticks.
- The older `EqualLength(A, B, C, D)` form is still supported for compatibility, but avoid it in new AI-authored content.
- Use `AngleMark(A, B, C)`, `AngleMark2(A, B, C)`, or `AngleMark3(A, B, C)` for matching angle arc marks.
- Keep title-page settings in the `title-page` JSON block.
- Do not paste rendered SVG, PDF, or image output into Mauthdown unless the app later adds an image block type.

## Import Behaviour

The importer first looks for authored Mauthdown containers such as `:::question`. If found, those containers are the source of truth. Older exports with a hidden `mauthdown-json` block are still accepted as a fallback for compatibility.
