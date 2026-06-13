import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";

import { inlineDisplayLatex, normalizeLatexSource, plainTextForSimpleInlineLatex } from "@/lib/latex";

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
}

export function renderMathJaxSvg(latex: string, options: boolean | MathJaxRenderOptions = false) {
  const display = typeof options === "boolean" ? options : (options.display ?? false);
  const plainSimpleInlineLatex = typeof options === "boolean" ? true : (options.plainSimpleInlineLatex ?? true);
  const trimmed = normalizeLatexSource(latex);
  if (!trimmed) return "";

  const plainText = display || !plainSimpleInlineLatex ? null : plainTextForSimpleInlineLatex(trimmed);
  if (plainText !== null) return escapeHtml(plainText);

  const source = display ? trimmed : inlineDisplayLatex(trimmed);
  const cacheKey = `${display ? "display" : "inline"}:${plainSimpleInlineLatex ? "plain-simple" : "math-simple"}\n${source}`;
  const cached = getCachedRender(cacheKey);
  if (cached !== undefined) return cached;

  let rendered: string;
  try {
    const node = html.convert(source, {
      display,
      containerWidth: 100000,
    });
    rendered = adaptor.outerHTML(node);
  } catch {
    rendered = `<span class="mathjax-error">${escapeHtml(trimmed)}</span>`;
  }

  setCachedRender(cacheKey, rendered);
  return rendered;
}
