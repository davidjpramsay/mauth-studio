# @mauth-studio/diagram-plotly

Plotly adapter for Mauth statistics charts.

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

The adapter returns Plotly `data`, `layout`, and `config` objects. The web app owns rendering, keeping this package independent of React and the DOM.

Current chart types:

- `histogram`
- `binomial`
- `normal`
- `box`
- `density`
- `blankAxes`

Histograms use precomputed bar traces so `bins` remains an exact interval count and `binSize` remains an exact interval width.

Normal and density charts accept structured `data.regions` with `between`, `leftTail`, `rightTail`, or `outside` modes. The adapter interpolates exact region bounds, emits stroke-free fill traces behind the base curve, and leaves Student/Solutions visibility filtering to the web layer.

Axis numbers and their short outward tick marks are native Plotly axis features on both axes, so they remain aligned through resizing and print scaling.

Add future statistical chart types here, not in the JSXGraph or Penrose adapters.
