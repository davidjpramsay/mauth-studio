import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";

import { inlineDisplayLatex, normalizeLatexSource } from "@/lib/latex";

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

export function renderMathJaxSvg(latex: string, display = false) {
  const trimmed = normalizeLatexSource(latex);
  if (!trimmed) return "";

  const source = display ? trimmed : inlineDisplayLatex(trimmed);
  const cacheKey = `${display ? "display" : "inline"}\n${source}`;
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
