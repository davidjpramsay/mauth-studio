import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import type { LiteElement } from "mathjax-full/js/adaptors/lite/Element.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";

import { inlineDisplayLatex, normalizeLatexSource, plainTextForSimpleInlineLatex } from "@/lib/latex";
import { alignedSolutionMarks } from "@/lib/solutionTextMarks";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: AllPackages,
});

const svg = new SVG({
  fontCache: "none",
});

const html = mathjax.document("", {
  InputJax: tex,
  OutputJax: svg,
});

const MATHJAX_RENDER_CACHE_LIMIT = 2000;
const mathJaxRenderCache = new Map<string, string>();

function getCachedRender(cacheKey: string) {
  const cached = mathJaxRenderCache.get(cacheKey);
  if (cached === undefined) return undefined;

  mathJaxRenderCache.delete(cacheKey);
  mathJaxRenderCache.set(cacheKey, cached);
  return cached;
}

function setCachedRender(cacheKey: string, value: string) {
  if (mathJaxRenderCache.size >= MATHJAX_RENDER_CACHE_LIMIT) {
    const oldestKey = mathJaxRenderCache.keys().next().value;
    if (oldestKey) mathJaxRenderCache.delete(oldestKey);
  }

  mathJaxRenderCache.set(cacheKey, value);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface MathJaxRenderOptions {
  display?: boolean;
  plainSimpleInlineLatex?: boolean;
  showSolutionMarks?: boolean;
}

function rowBaseline(row: LiteElement, svgNode: LiteElement) {
  let x = 0;
  let y = 0;
  for (let node = row; node && node !== svgNode; node = adaptor.parent(node)) {
    const transforms = Array.from(String(adaptor.getAttribute(node, "transform") ?? "").matchAll(/(\w+)\(([^)]*)\)/g));
    for (const [, kind, argumentsText] of transforms.reverse()) {
      const values = argumentsText.trim().split(/[ ,]+/).map(Number);
      if (kind === "translate") {
        x += values[0];
        y += values[1] ?? 0;
      } else if (kind === "scale") {
        x *= values[0];
        y *= values[1] ?? values[0];
      } else if (kind === "matrix") {
        const [a, b, c, d, e, f] = values;
        [x, y] = [a * x + c * y + e, b * x + d * y + f];
      } else return NaN;
    }
  }
  return y;
}

function renderAlignedMarks(node: LiteElement, rendered: string, rowMarks: number[]) {
  const count = Math.max(0, ...rowMarks);
  if (!count) return rendered;
  const svgNode = adaptor.tags(node, "svg")[0];
  const table = adaptor.tags(node, "g").find((entry) => adaptor.getAttribute(entry, "data-mml-node") === "mtable");
  if (!svgNode || !table) return rendered;
  const rows = adaptor
    .childNodes(table)
    .filter(
      (entry): entry is LiteElement =>
        adaptor.kind(entry) === "g" && ["mtr", "mlabeledtr"].includes(adaptor.getAttribute(entry as LiteElement, "data-mml-node")),
    );
  if (rows.length !== rowMarks.length) return rendered;
  const baselines = rows.map((row) => rowBaseline(row, svgNode));
  if (!baselines.every(Number.isFinite)) return rendered;
  const [, top, , height] = String(adaptor.getAttribute(svgNode, "viewBox")).split(/\s+/).map(Number);
  const width = count * 1200;
  const ticks = rowMarks
    .map((marks, index) =>
      marks
        ? `<g data-solution-row="${index}" aria-label="${marks} solution ${marks === 1 ? "mark" : "marks"}">${Array.from(
            { length: marks },
            (_, tick) =>
              `<text x="${width - (marks - tick - 1) * 1200}" y="${baselines[index]}" text-anchor="end" font-size="1450">✓</text>`,
          ).join("")}</g>`
        : "",
    )
    .join("");
  // Use MathJax's actual SVG row baselines, including fractions and explicit
  // row gaps. Both SVGs share a viewBox height, so print scaling stays exact.
  return `<span class="mathjax-aligned-marks">${rendered}<svg class="solution-row-marks" xmlns="http://www.w3.org/2000/svg" width="${(parseFloat(adaptor.getAttribute(svgNode, "height")) * width) / height}ex" height="${adaptor.getAttribute(svgNode, "height")}" viewBox="0 ${top} ${width} ${height}" role="img" aria-label="Solution marks" fill="#c1121f">${ticks}</svg></span>`;
}

export function renderMathJaxSvg(latex: string, options: boolean | MathJaxRenderOptions = false) {
  const display = typeof options === "boolean" ? options : (options.display ?? false);
  const plainSimpleInlineLatex = typeof options === "boolean" ? true : (options.plainSimpleInlineLatex ?? true);
  const showSolutionMarks = typeof options === "boolean" ? false : (options.showSolutionMarks ?? false);
  const alignedMarks = alignedSolutionMarks(normalizeLatexSource(latex));
  const trimmed = alignedMarks.latex;
  if (!trimmed) return "";

  const plainText = display || !plainSimpleInlineLatex ? null : plainTextForSimpleInlineLatex(trimmed);
  if (plainText !== null) return escapeHtml(plainText);

  const source = display ? trimmed : inlineDisplayLatex(trimmed);
  const cacheKey = `${display ? "display" : "inline"}:${plainSimpleInlineLatex ? "plain-simple" : "math-simple"}:${showSolutionMarks ? alignedMarks.rowMarks.join(",") : "hidden"}\n${source}`;
  const cached = getCachedRender(cacheKey);
  if (cached !== undefined) return cached;

  let rendered: string;
  try {
    const node = html.convert(source, {
      display,
      containerWidth: 100000,
    });
    rendered = adaptor.outerHTML(node);
    if (showSolutionMarks) rendered = renderAlignedMarks(node, rendered, alignedMarks.rowMarks);
  } catch {
    rendered = `<span class="mathjax-error">${escapeHtml(trimmed)}</span>`;
  }

  setCachedRender(cacheKey, rendered);
  return rendered;
}
