# @mauth-studio/diagram-plotly

Plotly-backed statistics chart adapter for the maths authoring app.

The package accepts the shared diagram shape:

```json
{
  "type": "statsChart",
  "data": {
    "chartType": "histogram",
    "values": [3, 5, 7, 7, 8, 10]
  },
  "style": "exam",
  "options": {
    "showGrid": true,
    "showFill": true,
    "fillColor": "#f5f5f5",
    "fillOpacity": 1,
    "interactive": false
  }
}
```

It returns controlled Plotly `data`, `layout`, and `config` objects. Rendering happens in the web app so this package remains independent of React and DOM lifecycle code.

Current chart types:

- `histogram`
- `binomial`
- `normal`
- `box`

Histogram traces are precomputed as bar traces rather than delegated to Plotly's native histogram binning. This keeps `bins` as an exact interval count and `binSize` as an exact interval width, which is important for worksheet consistency.

Future chart families should extend this package rather than the JSXGraph or Penrose diagram systems.
