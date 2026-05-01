# Mauthdown

Mauthdown is the source format for editable maths tests. It is Markdown with a small set of explicit containers so humans, AI tools, and the app can all edit the same document without guessing the structure.

The format is intentionally not a Word or Pages clone. It stores test meaning first: title-page data, questions, parts, subparts, marks, choice lists, diagrams, spaces, and page breaks. The app then applies formatting rules when it renders the test.

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

Use `$...$` for inline maths and `$$...$$` for display maths.

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

### Statistics Charts

Statistics charts use `type="statsChart"` and a JSON chart DSL. The app converts the DSL into a controlled Plotly configuration with worksheet-style fonts, margins, axis lines, and grid rules.

Histogram:

````md
:::diagram type="statsChart" align="center"

```json
{
  "type": "statsChart",
  "data": {
    "chartType": "histogram",
    "values": [3, 5, 7, 7, 8, 10],
    "bins": 2,
    "xLabel": "Score",
    "yLabel": "Frequency"
  },
  "options": {
    "showGrid": true,
    "blackAndWhite": true,
    "interactive": false
  }
}
```

:::
````

For histograms, `bins` means the exact number of intervals. If `binSize` is supplied instead, it means the exact interval width. The app precomputes the interval counts before handing the chart to Plotly so Plotly does not silently choose a different bin layout.

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
Label L $\\,$
Label V $\\,$
Label R $\\,$
LengthLabel angleTheta
Label angleTheta $\theta$

Triangle(L, V, R)
EqualLength(V, L, V, R)
LabelsAngle(angleTheta, L, V, R)
```

This constrains the two sides to be equal and draws matching tick marks. Use blank labels such as `$\\,$` when points should not show visible vertex labels.

## AI Authoring Rules

- Prefer explicit containers over headings when creating tests.
- Do not store automatic labels for questions, parts, or subparts.
- Use marks as numeric attributes.
- Put graph configs in `json` fences.
- Put Plotly-backed statistics charts in `statsChart` JSON diagram blocks.
- Put Penrose geometry in `penrose` fences.
- Use `EqualLength(A, B, C, D)` for equal-length marks instead of adding text labels for equal sides.
- Keep title-page settings in the `title-page` JSON block.
- Do not paste rendered SVG, PDF, or image output into Mauthdown unless the app later adds an image block type.

## Import Behaviour

The importer first looks for authored Mauthdown containers such as `:::question`. If found, those containers are the source of truth. Older exports with a hidden `mauthdown-json` block are still accepted as a fallback for compatibility.
