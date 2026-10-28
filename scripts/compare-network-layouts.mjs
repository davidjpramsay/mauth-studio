#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";
import { instance } from "@viz-js/viz";
import { renderGeometricConstructionDiagram } from "../packages/diagram-penrose/src/index.mjs";
import { networkComparisonFixtures } from "../packages/diagram-penrose/fixtures/network-comparison.mjs";
import { boxesOverlap, segmentHitsBox, segmentsCross } from "../packages/diagram-penrose/src/networkLayout.mjs";

const output = process.argv[2] ?? (await fs.mkdtemp(path.join(os.tmpdir(), "mauth-network-comparison-")));
await fs.mkdir(output, { recursive: true });
const viz = await instance();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const rows = [];
function dot(spec, seed) {
  const quote = JSON.stringify;
  return (
    `digraph G { graph [start=${quote(String(seed + 1))}, overlap=false, splines=line, outputorder=edgesfirst, forcelabels=true, margin=0, pad=0.2]; node [shape=point,width=0.0833,height=0.0833,fontname="Times-Italic",fontsize=16.133]; edge [fontname="Times-Roman",fontsize=16.133,penwidth=2,arrowsize=0.75,len=1.8056];\n` +
    spec.data.objects.map((n) => `${quote(n.name)} [xlabel=${quote(n.label)}];`).join("\n") +
    "\n" +
    spec.data.relationships
      .map(
        (r) =>
          `${quote(r.points[0])} -> ${quote(r.points[1])} [xlabel=${quote(r.label)},dir=${r.type === "vectorSegment" ? "forward" : "none"}];`,
      )
      .join("\n") +
    "\n}"
  );
}
async function measurements(svg, engine) {
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  return await page.evaluate((engine) => {
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    const labels = [...document.querySelectorAll(engine === "Penrose" ? "[data-mauth-penrose-label]" : ".node text, .edge text")].map(box);
    const nodes = [...document.querySelectorAll(engine === "Penrose" ? "circle" : ".node ellipse")]
      .filter(
        (el) =>
          engine !== "Penrose" ||
          (el.querySelector("title")?.textContent ?? el.parentElement.querySelector("title")?.textContent ?? "").endsWith(".dot"),
      )
      .map(box);
    const elements = [...document.querySelectorAll(engine === "Penrose" ? "line" : ".edge path")].filter((element) => {
      if (engine === "Penrose") return true;
      const endpoints = element.parentElement.querySelector("title")?.textContent?.split("->");
      return !endpoints || endpoints[0] !== endpoints[1]; // loop circles are omitted in both engines' metrics
    });
    const edges = elements.map((el) => {
      const matrix = el.getScreenCTM(),
        length = el.getTotalLength();
      return Array.from({ length: 21 }, (_, i) => {
        const p = el.getPointAtLength((length * i) / 20);
        const transformed = new DOMPoint(p.x, p.y).matrixTransform(matrix);
        return [transformed.x, transformed.y];
      });
    });
    return { labels, nodes, edges };
  }, engine);
}
function metrics({ labels, nodes, edges }) {
  let labelOverlaps = 0,
    labelEdgeHits = 0,
    labelNodeHits = 0,
    crossings = 0;
  labels.forEach((label, i) => {
    labelOverlaps += labels.slice(i + 1).filter((other) => boxesOverlap(label, other)).length;
    labelNodeHits += nodes.filter((node) => boxesOverlap(label, node)).length;
    labelEdgeHits += edges.filter((points) => points.some((p, j) => j && segmentHitsBox(points[j - 1], p, label))).length;
  });
  edges.forEach((edge, i) => {
    for (const other of edges.slice(i + 1))
      if (edge.some((p, j) => j && other.some((q, k) => k && segmentsCross(edge[j - 1], p, other[k - 1], q)))) crossings++;
  });
  return { labels: labels.length, labelOverlaps, labelEdgeHits, labelNodeHits, crossings };
}
try {
  for (const [name, fixture] of Object.entries(networkComparisonFixtures)) {
    for (let seed = 0; seed < 5; seed++) {
      for (const engine of ["Penrose", "Graphviz"]) {
        const started = performance.now();
        const result =
          engine === "Penrose"
            ? await renderGeometricConstructionDiagram({
                ...fixture,
                options: { ...fixture.options, variation: `comparison-${name}-${seed}` },
              })
            : null;
        const source = engine === "Graphviz" ? dot(fixture, seed) : null;
        const svg = result?.svg ?? viz.renderString(source, { engine: "neato", format: "svg" });
        const elapsedMs = Math.round(performance.now() - started);
        const file = `${name}-${seed}-${engine.toLowerCase()}.svg`;
        await fs.writeFile(path.join(output, file), svg);
        if (source) await fs.writeFile(path.join(output, `${name}-${seed}.dot`), source);
        rows.push({
          name,
          seed,
          engine,
          file,
          elapsedMs,
          ...metrics(await measurements(svg, engine)),
          solverQuality: result?.metadata.networkLayout,
        });
      }
    }
  }
  const summary = ["Penrose", "Graphviz"].map((engine) => {
    const data = rows.filter((r) => r.engine === engine);
    return {
      engine,
      renders: data.length,
      meanMs: Math.round(data.reduce((s, r) => s + r.elapsedMs, 0) / data.length),
      maxMs: Math.max(...data.map((r) => r.elapsedMs)),
      labelOverlaps: data.reduce((s, r) => s + r.labelOverlaps, 0),
      labelEdgeHits: data.reduce((s, r) => s + r.labelEdgeHits, 0),
      labelNodeHits: data.reduce((s, r) => s + r.labelNodeHits, 0),
      crossings: data.reduce((s, r) => s + r.crossings, 0),
    };
  });
  await fs.writeFile(
    path.join(output, "results.json"),
    JSON.stringify({ penrose: "3.3.1", viz: "3.31.0", graphviz: viz.graphvizVersion, engine: "neato", seeds: 5, summary, rows }, null, 2),
  );
  const table =
    "<table><tr><th>Engine</th><th>Renders</th><th>Mean ms</th><th>Max ms</th><th>Label / label</th><th>Label / edge</th><th>Label / node</th><th>Crossings</th></tr>" +
    summary
      .map(
        (r) =>
          "<tr>" +
          [r.engine, r.renders, r.meanMs, r.maxMs, r.labelOverlaps, r.labelEdgeHits, r.labelNodeHits, r.crossings]
            .map((v) => `<td>${v}</td>`)
            .join("") +
          "</tr>",
      )
      .join("") +
    "</table>";
  const panels = [];
  for (const [name] of Object.entries(networkComparisonFixtures))
    for (let seed = 0; seed < 5; seed++) {
      const pair = rows.filter((r) => r.name === name && r.seed === seed);
      panels.push(
        `<h2>${name} · seed ${seed}</h2><div class="pair">` +
          (
            await Promise.all(
              pair.map(
                async (r) =>
                  `<section><h3>${r.engine} · ${r.elapsedMs} ms</h3>${(await fs.readFile(path.join(output, r.file), "utf8")).replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>/g, "")}<p>${r.labelOverlaps} label overlaps · ${r.labelEdgeHits} label/edge hits · ${r.crossings} crossings</p></section>`,
              ),
            )
          ).join("") +
          "</div>",
      );
    }
  const html = `<!doctype html><meta charset="utf-8"><title>Mauth network layout comparison</title><style>body{font:16px system-ui;color:#172033;margin:32px;background:#f3f5f8}h1{font-size:30px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{background:white;padding:20px;border-radius:12px}section>svg{display:block;width:100%;height:340px}td,th{text-align:left;padding:10px;border-bottom:1px solid #ccd}table{background:white;width:100%}p{line-height:1.5}</style><h1>Penrose 3.3.1 and Graphviz ${viz.graphvizVersion}</h1><p>Identical nodes, connections, directions and weights. Five deterministic seeds on each of four graphs. Graphviz neato via Viz.js 3.31.0 with external node/edge labels; labels use 16.133-unit text, 6-unit dots and comparable strokes and 130-unit target edge lengths. Penrose uses MathJax, Graphviz uses Times text. Warm-library render timing includes layout and SVG generation; setup/browser measurement excluded.</p>${table}<p>Metrics independently measure rendered label bounding boxes and sampled SVG edges; box intersections are conservative, not glyph-pixel collisions. Crossings are edge-pair counts; K3,3 is intentionally nonplanar. Metrics omit loop-circle collisions, arrowheads and semantic label attachment, so inspect every panel. Custom Style and mathematical geometry are outside this network comparison. No renderer migration is implied.</p>${panels.join("")}`;
  await fs.writeFile(path.join(output, "comparison.html"), html);
  await page.setContent(html);
  await page.screenshot({ path: path.join(output, "comparison.png"), fullPage: true });
  console.log(JSON.stringify({ output, summary }, null, 2));
} finally {
  await browser.close();
}
